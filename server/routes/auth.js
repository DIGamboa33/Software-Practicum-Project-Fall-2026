import { Router } from "express";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";

const authRouter = Router();

function relationName(relation) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

function isDeactivatedAuthError(error) {
  const details = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return details.includes("banned") || details.includes("deactivated");
}

authRouter.post("/register", async (request, response) => {
  const firstName = String(request.body.firstName || "").trim();
  const lastName = String(request.body.lastName || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  const utepId = String(request.body.utepId || "").trim() || null;
  const accountType = String(request.body.accountType || "Student");

  if (!firstName || !lastName || password.length < 8) {
    return response.status(400).json({
      message: "Enter a first name, last name, and a password with at least 8 characters.",
    });
  }
  if (!/^[^\s@]+@careflow\.test$/i.test(email)) {
    return response.status(400).json({ message: "Use an email address ending in @careflow.test." });
  }
  if (!["Student", "Patient"].includes(accountType)) {
    return response.status(400).json({ message: "Choose either a Student or Patient account type." });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", accountType)
      .single();
    if (roleError || !role) {
      return response.status(500).json({ message: `The ${accountType} role is not configured.` });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
      },
    });
    if (authError || !authData.user) {
      return response.status(400).json({
        message: authError?.message || "Unable to create this account.",
      });
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: authData.user.id,
      first_name: firstName,
      last_name: lastName,
      utep_id: utepId,
      role_id: role.id,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error("Unable to create registered user profile:", profileError.message);
      return response.status(500).json({ message: "Unable to create the account profile." });
    }

    return response.status(201).json({
      message: `Your ${accountType} account has been created. You can now sign in.`,
    });
  } catch (error) {
    console.error("Registration failed:", error);
    return response.status(500).json({ message: "Unable to create your account." });
  }
});

authRouter.post("/login", async (request, response) => {
  const { email, password } = request.body;

  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (isDeactivatedAuthError(authError)) {
    return response.status(403).json({
      message: "This account has been deactivated. Please contact an administrator to reactivate it.",
    });
  }

  if (authError || !authData.user) {
    return response.status(401).json({ message: "Invalid email or password." });
  }

  const userId = authData.user.id;
  // Load the user profile through the server-only client. This prevents
  // profile relationships from being hidden by browser-facing RLS policies.
  const supabaseAdmin = getSupabaseAdmin();
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select(`
      id,
      first_name,
      last_name,
      role_id,
      sub_role_id,
      roles:role_id(name),
      subroles:sub_role_id(name)
    `)
    .eq("id", userId)
    .single();

  if (profileError || !profileData) {
    return response.status(500).json({ message: "User authenticated, but profile not found." });
  }
  const firstName = profileData.first_name || "";
  const lastName = profileData.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  
  const formattedUser = {
    id: profileData.id,
    email: authData.user.email,
    firstName: firstName,
    lastName: lastName,
    role: relationName(profileData.roles),
    name: fullName,        
    initials: initials,    
    subrole: relationName(profileData.subroles),
  };

  return response.json({
    ...formattedUser,
    accessToken: authData.session.access_token,
  });
});


// Restore the currently logged-in user's information.
authRouter.get("/me", async (request, response) => {
  try {
    // Read the login token from the request.
    const authorization = request.get("authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return response.status(401).json({
        message: "Login required.",
      });
    }

    const token = authorization.slice(7);

    // Verify that the token belongs to a real user.
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return response.status(401).json({
        message: "Invalid or expired session.",
      });
    }

    // Load their profile from Supabase.
    const db = getSupabaseAdmin();

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name,
        roles:role_id(name),
        subroles:sub_role_id(name)
      `)
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      return response.status(404).json({
        message: "User profile not found.",
      });
    }

    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";

    // Return the same user information used during login.
    return response.json({
      id: profile.id,
      email: authData.user.email,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`.trim(),
      initials:
        `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
      role: relationName(profile.roles),
      subrole: relationName(profile.subroles),
    });

  } catch (error) {
    console.error("Session restoration error:", error);

    return response.status(500).json({
      message: "Unable to restore session.",
    });
  }
});


export default authRouter;
