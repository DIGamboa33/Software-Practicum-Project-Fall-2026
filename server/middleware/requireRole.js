
import { supabase, getSupabaseAdmin } from "../services/supabase.js";

// Check a user's role before allowing access to an API.
export function requireRole(expectedRole, expectedSubroleId = null) {
  return async function (request, response, next) {
    const authorization = request.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return response.status(401).json({
        message: "Please sign in first.",
      });
    }

    try {
      // Step 1: Verify the login token with Supabase.
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data?.user) {
        return response.status(401).json({
          message: "Invalid or expired session.",
        });
      }

      // Step 2: Read the user's actual database permissions.
      const admin = getSupabaseAdmin();

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("sub_role_id, roles:role_id(name)")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      const actualRole = Array.isArray(profile?.roles)
        ? profile.roles[0]?.name
        : profile?.roles?.name;

      // Step 3: Reject users with the wrong role or discipline.
      if (
        actualRole !== expectedRole ||
        (expectedSubroleId !== null &&
          Number(profile?.sub_role_id) !== expectedSubroleId)
      ) {
        return response.status(403).json({
          message: "You do not have permission to access this resource.",
        });
      }

      // Step 4: Authorized. Continue to the API endpoint.
      next();
    } catch (error) {
      console.error("Authorization failed:", error);
      return response.status(500).json({
        message: "Unable to verify permissions.",
      });
    }
  };
}
