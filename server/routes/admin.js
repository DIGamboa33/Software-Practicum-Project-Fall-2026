import { Router } from "express";
import { randomBytes, randomInt } from "node:crypto";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";
import { writeAuditLog } from "../services/auditLog.js";

const adminRouter = Router();

function getRelationName(relation) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

function getAccessToken(request) {
  return (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function requireAdmin(request, response) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    response.status(401).json({ message: "Missing access token." });
    return null;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(
    accessToken,
  );
  if (authError || !authData.user) {
    response.status(401).json({ message: "Your session has expired." });
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("roles(name)")
    .eq("id", authData.user.id)
    .single();

  if (profileError || getRelationName(profile?.roles) !== "Admin") {
    response.status(403).json({ message: "Administrator access is required." });
    return null;
  }

  return { supabaseAdmin, actor: authData.user };
}

function isAdminRole(roleName) {
  return String(roleName || "").toLowerCase() === "admin";
}

function getDisplayName(profile, fallbackUser) {
  const firstName = profile?.first_name || fallbackUser?.user_metadata?.first_name || "";
  const lastName = profile?.last_name || fallbackUser?.user_metadata?.last_name || "";
  return `${firstName} ${lastName}`.trim() || "Unnamed user";
}

function makeCareflowEmail(firstName, lastName) {
  const localPart = `${firstName}.${lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const suffix = randomInt(100000, 1000000);
  return `${localPart || "student"}.${suffix}@careflow.test`;
}

function generateTemporaryPassword() {
  return `Cf!${randomBytes(18).toString("base64url")}9a`;
}



async function ensureAuditLogReady(supabaseAdmin, response) {
  const { error } = await supabaseAdmin.from("admin_audit_log").select("id").limit(1);
  if (!error) return true;
  response.status(503).json({
    message: "Run the admin audit-log SQL setup before managing accounts.",
  });
  return false;
}

async function getRoleAndSubrole(supabaseAdmin, roleId, subroleId) {
  const [{ data: role, error: roleError }, subroleResult] = await Promise.all([
    supabaseAdmin.from("roles").select("id, name").eq("id", roleId).single(),
    subroleId
      ? supabaseAdmin.from("subroles").select("id, name").eq("id", subroleId).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (roleError || !role || subroleResult.error) return null;
  return { role, subrole: subroleResult.data };
}

function buildStats(users) {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const roleCounts = users.reduce((counts, user) => {
    const role = user.role || "Unassigned";
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});

  return {
    totalUsers: users.length,
    newThisWeek: users.filter(
      (user) => user.createdAt && new Date(user.createdAt).getTime() >= oneWeekAgo,
    ).length,
    usersWithSubrole: users.filter((user) => user.subrole).length,
    roleBreakdown: Object.entries(roleCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => second.count - first.count),
  };
}

adminRouter.get("/users", async (request, response) => {
  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin } = adminContext;

    const [{ data: profiles, error: profilesError }, authResult] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select(
            "id, first_name, last_name, utep_id, careflow_id, created_at, roles(name), subroles(name)",
          )
          .order("created_at", { ascending: false }),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    if (profilesError || authResult.error) {
      console.error(
        "Unable to load admin directory:",
        profilesError?.message || authResult.error?.message,
      );
      return response.status(500).json({ message: "Unable to load the user directory." });
    }

    const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const directory = (authResult.data.users || []).map((authUser) => {
      const profile = profilesById.get(authUser.id);
      return {
        id: authUser.id,
        name: getDisplayName(profile, authUser),
        email: authUser.email || "",
        role: getRelationName(profile?.roles) || null,
        subrole: getRelationName(profile?.subroles) || null,
        utepId: profile?.utep_id || null,
        careflowId: profile?.careflow_id || null,
        createdAt: profile?.created_at || authUser.created_at || null,
        emailConfirmed: Boolean(authUser.email_confirmed_at),
        hasProfile: Boolean(profile),
        isActive: !authUser.banned_until || new Date(authUser.banned_until) <= new Date(),
      };
    });
    const search = String(request.query.query || "").trim().toLowerCase();
    const users = search
      ? directory.filter((user) =>
        [
          user.name,
          user.email,
          user.role,
          user.subrole,
          user.utepId,
          user.careflowId,
          user.id,
        ].some((value) => String(value || "").toLowerCase().includes(search)),
      )
      : directory;

    return response.json({ users, stats: buildStats(directory) });
  } catch (error) {
    console.error("Unable to load admin directory:", error);
    return response.status(500).json({ message: "Unable to load the user directory." });
  }
});

adminRouter.get("/patients", async (request, response) => {
  try {
    // Make sure the person requesting this page is actually an Admin.
    const adminContext = await requireAdmin(request, response);

    if (!adminContext) {
      return;
    }

    const { supabaseAdmin } = adminContext;

    // Get profile information from Supabase.
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, last_name, careflow_id, created_at, roles(name)",
      )
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error(
        "Unable to load patient profiles:",
        profilesError.message,
      );

      return response.status(500).json({
        message: "Unable to load patients.",
      });
    }

    // Keep only profiles whose role is Patient.
    const patientProfiles = (profiles || []).filter((profile) => {
      return getRelationName(profile.roles) === "Patient";
    });

    // Get the Supabase Auth users so we can also display email addresses.
    const authResult = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    // Check whether Supabase returned an error.
    if (authResult.error) {
      console.error(
        "Unable to load patient accounts:",
        authResult.error.message,
      );

      return response.status(500).json({
        message: "Unable to load patient accounts.",
      });
    }

    // Get the list of Auth users.
    // If Supabase does not return a users array, use an empty array.
    const authUsers = authResult.data?.users || [];

    // Create a Map so we can quickly match a profile to its Auth account.
    const authUsersById = new Map();

    for (const authUser of authUsers) {
      authUsersById.set(authUser.id, authUser);
    }

    // Build a simpler patient object for the React frontend.
    const patients = patientProfiles.map((profile) => {
      const authUser = authUsersById.get(profile.id);

      const firstName = profile.first_name || "";
      const lastName = profile.last_name || "";

      return {
        id: profile.id,
        careflowId: profile.careflow_id || null,
        name: `${firstName} ${lastName}`.trim(),
        email: authUser?.email || "",
        createdAt: profile.created_at || null,
      };
    });

    // Send the patient list back to React.
    return response.json(patients);
  } catch (error) {
    console.error("Unable to load patient directory:", error);

    return response.status(500).json({
      message: "Unable to load patients.",
    });
  }
});

adminRouter.get("/patients/:patientId", async (request, response) => {
  try {
    // Make sure the person requesting the patient is an Admin.
    const adminContext = await requireAdmin(request, response);

    if (!adminContext) {
      return;
    }

    const { supabaseAdmin } = adminContext;

    // Get the patient ID from the URL.
    const patientId = request.params.patientId;

    // Find the patient's profile in the profiles table.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, last_name, careflow_id, created_at, roles(name)",
      )
      .eq("id", patientId)
      .single();

    if (profileError || !profile) {
      return response.status(404).json({
        message: "Patient not found.",
      });
    }

    // Make sure this profile actually belongs to a Patient.
    if (getRelationName(profile.roles) !== "Patient") {
      return response.status(404).json({
        message: "Patient not found.",
      });
    }

    // Get the matching Supabase Auth account.
    const authResult =
      await supabaseAdmin.auth.admin.getUserById(patientId);

    if (authResult.error || !authResult.data?.user) {
      return response.status(500).json({
        message: "Unable to load the patient account.",
      });
    }

    const authUser = authResult.data.user;

    // Get the patient's information from patient_records.
    const { data: patientRecord, error: patientRecordError } =
      await supabaseAdmin
        .from("patient_records")
        .select(
          "date_of_birth, sex, phone, address, primary_provider, created_at, updated_at",
        )
        .eq("profile_id", patientId)
        .maybeSingle();

    if (patientRecordError) {
      console.error(
        "Unable to load patient information:",
        patientRecordError.message,
      );

      return response.status(500).json({
        message: "Unable to load patient information.",
      });
    }


    // Get the patient's clinical information from Supabase.
    // These tables are already used by the Instructor dashboard.
    const portal = supabaseAdmin.schema("patient_portal");

    const [
      medicationsResult,
      allergiesResult,
      historyResult,
      appointmentsResult,
      vitalsResult,
    ] = await Promise.all([
      portal
        .from("medications")
        .select("*")
        .eq("patient_id", patientId),

      portal
        .from("allergies")
        .select("*")
        .eq("profile_id", patientId),

      portal
        .from("medical_history")
        .select("*")
        .eq("profile_id", patientId),

      portal
        .from("appointments")
        .select("*")
        .eq("patient_id", patientId),

      portal
        .from("vitals")
        .select("*")
        .eq("patient_id", patientId),
    ]);

    // If one of the queries fails, report the error.
    const clinicalError =
      medicationsResult.error ||
      allergiesResult.error ||
      historyResult.error ||
      appointmentsResult.error ||
      vitalsResult.error;

    if (clinicalError) {
      console.error(
        "Unable to load clinical records:",
        clinicalError.message
      );

      return response.status(500).json({
        message: "Unable to load patient clinical information.",
      });
    }


    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";

    // Build the patient object that will be sent to React.
    const patient = {
      // Account information from profiles and Supabase Auth.
      id: profile.id,
      careflowId: profile.careflow_id || null,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`.trim(),
      email: authUser.email || "",
      createdAt: profile.created_at || authUser.created_at || null,
      emailConfirmed: Boolean(authUser.email_confirmed_at),

      isActive:
        !authUser.banned_until ||
        new Date(authUser.banned_until) <= new Date(),

      // Patient-specific information from patient_records.
      dateOfBirth: patientRecord?.date_of_birth || null,
      sex: patientRecord?.sex || null,
      phone: patientRecord?.phone || null,
      address: patientRecord?.address || null,
      
      primaryProvider: patientRecord?.primary_provider || null,
      updatedAt: patientRecord?.updated_at || null,

      // Clinical records
      medications: medicationsResult.data || [],
      allergies: allergiesResult.data || [],
      medicalHistory: historyResult.data || [],
      appointments: appointmentsResult.data || [],
      vitals: vitalsResult.data || [],

    };

    return response.json(patient);
  } catch (error) {
    console.error("Unable to load patient record:", error);

    return response.status(500).json({
      message: "Unable to load patient record.",
    });
  }
});

adminRouter.get("/access-options", async (request, response) => {
  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin } = adminContext;
    const [{ data: roles, error: rolesError }, { data: subroles, error: subrolesError }] =
      await Promise.all([
        supabaseAdmin.from("roles").select("id, name").order("name"),
        supabaseAdmin.from("subroles").select("id, name").order("name"),
      ]);

    if (rolesError || subrolesError) {
      return response.status(500).json({ message: "Unable to load access options." });
    }

    return response.json({
      roles: (roles || []).filter((role) => !isAdminRole(role.name)),
      subroles: subroles || [],
    });
  } catch (error) {
    console.error("Unable to load access options:", error);
    return response.status(500).json({ message: "Unable to load access options." });
  }
});

adminRouter.get("/academics", async (request, response) => {
  try {
    const context = await requireAdmin(request, response);
    if (!context) return;
    const { supabaseAdmin } = context;
    const school = supabaseAdmin.schema("school");
    const [{ data: classrooms, error: classroomError }, { data: memberships, error: membershipError }, { data: enrollments, error: enrollmentError }, { data: profiles, error: profileError }, { data: subroles, error: subroleError }] = await Promise.all([
      school.from("classrooms").select("id, crn, full_name, short_name, room, term, discipline_subrole_id, status").order("term", { ascending: false }),
      school.from("classroom_instructors").select("classroom_id, instructor_id, access_level"),
      school.from("classroom_enrollments").select("classroom_id, student_id, status").eq("status", "active"),
      supabaseAdmin.from("profiles").select("id, first_name, last_name, role_id, sub_role_id, roles(name), subroles(name)"),
      supabaseAdmin.from("subroles").select("id, name").order("name"),
    ]);
    if (classroomError || membershipError || enrollmentError || profileError || subroleError) throw classroomError || membershipError || enrollmentError || profileError || subroleError;
    // Get the accepted disciplines for all classrooms
    const { data: allowedRows, error: allowedError } = await school
      .from("classroom_allowed_subroles")
      .select("classroom_id, subrole_id");

    if (allowedError) {
      throw allowedError;
    }
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const instructorsByClass = new Map();
    (memberships || []).forEach((membership) => {
      const current = instructorsByClass.get(membership.classroom_id) || [];
      const profile = profileById.get(membership.instructor_id);
      if (profile) current.push({ id: profile.id, name: `${profile.first_name} ${profile.last_name}`.trim(), subrole: getRelationName(profile.subroles), accessLevel: membership.access_level });
      instructorsByClass.set(membership.classroom_id, current);
    });
    const enrollmentCounts = (enrollments || []).reduce((counts, row) => ({ ...counts, [row.classroom_id]: (counts[row.classroom_id] || 0) + 1 }), {});
    const studentsByClass = new Map();
    (enrollments || []).forEach((enrollment) => {
      const profile = profileById.get(enrollment.student_id);
      if (!profile || getRelationName(profile.roles) !== "Student") return;
      const current = studentsByClass.get(enrollment.classroom_id) || [];
      current.push({
        id: profile.id,
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        subrole: getRelationName(profile.subroles),
        utepId: profile.utep_id || null,
      });
      studentsByClass.set(enrollment.classroom_id, current);
    });
    const subroleById = new Map((subroles || []).map((subrole) => [subrole.id, subrole.name]));
    return response.json({
      semesters: [...new Set((classrooms || []).map((classroom) => classroom.term))],
      classrooms: (classrooms || []).map((classroom) => ({ ...classroom, discipline: subroleById.get(classroom.discipline_subrole_id) || "Unassigned", instructors: instructorsByClass.get(classroom.id) || [], students: studentsByClass.get(classroom.id) || [], studentCount: enrollmentCounts[classroom.id] || 0, allowedSubroleIds: (allowedRows || []).filter((row) => row.classroom_id === classroom.id).map((row) => row.subrole_id) })),
      students: (profiles || []).filter((profile) => getRelationName(profile.roles) === "Student").map((profile) => ({ id: profile.id, name: `${profile.first_name} ${profile.last_name}`.trim(), subrole: getRelationName(profile.subroles), utepId: profile.utep_id || null })),
      instructors: (profiles || []).filter((profile) => getRelationName(profile.roles) === "Instructor").map((profile) => ({ id: profile.id, name: `${profile.first_name} ${profile.last_name}`.trim(), subroleId: profile.sub_role_id, subrole: getRelationName(profile.subroles) })),
      subroles: subroles || [],
    });
  } catch (error) {
    console.error("Unable to load academic administration:", error);
    return response.status(500).json({ message: "Unable to load classroom administration." });
  }
});

adminRouter.post("/academics/classrooms", async (request, response) => {
  const crn = String(request.body.crn || "").trim();
  const fullName = String(request.body.fullName || "").trim();
  const shortName = String(request.body.shortName || "").trim();
  const room = String(request.body.room || "").trim() || null;
  const term = String(request.body.term || "").trim();
  const disciplineSubroleId = Number(request.body.disciplineSubroleId);
  const instructorId = String(request.body.instructorId || "").trim();
  // Derek additional accepted disciplines.
  const additionalInput = request.body.additionalSubroleIds;

  if (
    additionalInput !== undefined &&
    !Array.isArray(additionalInput)
  ) {
    return response.status(400).json({
      message: "Additional disciplines must be a list."
    });
  }

  const additionalSubroleIds =
    (additionalInput || []).map(Number);

  // Only accept valid positive numeric IDs.
  if (
    additionalSubroleIds.length > 30 ||
    additionalSubroleIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0
    )
  ) {
    return response.status(400).json({
      message: "Invalid additional disciplines."
    });
  }


  if (!crn || !fullName || !shortName || !term || !disciplineSubroleId) {
    return response.status(400).json({ message: "CRN, class names, term, and discipline are required." });
  }

  try {
    const context = await requireAdmin(request, response);
    if (!context) return;
    const { supabaseAdmin, actor } = context;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;
    const school = supabaseAdmin.schema("school");
    const { data: discipline, error: disciplineError } = await supabaseAdmin
      .from("subroles")
      .select("id, name")
      .eq("id", disciplineSubroleId)
      .single();
    if (disciplineError || !discipline) {
      return response.status(400).json({ message: "Choose a valid discipline." });
    }


    // Combine the primary discipline with the additional ones.
    // Set prevents duplicate IDs.
    const allowedIds = [
      ...new Set([
        disciplineSubroleId,
        ...additionalSubroleIds
      ])
    ];

    // Verify that every selected discipline exists.
    const { data: validSubroles, error: subrolesError } =
      await supabaseAdmin
        .from("subroles")
        .select("id")
        .in("id", allowedIds);

    if (subrolesError) {
      throw subrolesError;
    }

    if ((validSubroles || []).length !== allowedIds.length) {
      return response.status(400).json({
        message: "One or more selected disciplines are invalid."
      });
    }


    if (instructorId) {
      const { data: instructor, error: instructorError } = await supabaseAdmin
        .from("profiles")
        .select("id, sub_role_id, roles(name)")
        .eq("id", instructorId)
        .single();
      if (instructorError || getRelationName(instructor?.roles) !== "Instructor" || instructor.sub_role_id !== disciplineSubroleId) {
        return response.status(400).json({ message: "Choose an Instructor with the same discipline as this classroom." });
      }
    }

    const { data: classroom, error: classroomError } = await school
      .from("classrooms")
      .insert({ crn, full_name: fullName, short_name: shortName, room, term, discipline_subrole_id: disciplineSubroleId, created_by: actor.id, status: "active" })
      .select("id, crn, full_name, short_name, room, term, discipline_subrole_id, status")
      .single();
    if (classroomError) {
      if (classroomError.code === "23505") return response.status(400).json({ message: "A classroom with that CRN already exists." });
      throw classroomError;
    }


    // Derek cross-discipline enrollment change.
    // Automatically allow the classroom's primary discipline.
    // Save every accepted discipline for this classroom.
    const disciplineRows = allowedIds.map((id) => ({
      classroom_id: classroom.id,
      subrole_id: id
    }));

    const { error: allowedDisciplineError } = await school
      .from("classroom_allowed_subroles")
      .insert(disciplineRows);


    // If the discipline cannot be saved, undo the new classroom.
    if (allowedDisciplineError) {
      console.error(
        "Unable to save classroom discipline:",
        allowedDisciplineError
      );

      const { error: cleanupError } = await school
        .from("classrooms")
        .delete()
        .eq("id", classroom.id);

      if (cleanupError) {
        console.error("Unable to undo classroom creation:", cleanupError);
      }

      return response.status(500).json({
        message: "Unable to save the classroom's accepted discipline."
      });
    }


    if (instructorId) {
      const { error: membershipError } = await school.from("classroom_instructors").insert({
        classroom_id: classroom.id,
        instructor_id: instructorId,
        access_level: "owner",
      });
      if (membershipError) {
        const { error: cleanupError } = await school
          .from("classrooms")
          .delete()
          .eq("id", classroom.id);

        if (cleanupError) {
          console.error("Classroom cleanup failed:", cleanupError);
        }

        throw membershipError;
      }
    }

    await writeAuditLog(supabaseAdmin, {
      actor_id: actor.id,
      action: "classroom.created",
      details: { classroomId: classroom.id, crn, term, discipline: discipline.name, instructorId: instructorId || null },
    });
    return response.status(201).json({ classroom, message: "Classroom created." });
  } catch (error) {
    console.error("Unable to create classroom:", error);
    return response.status(500).json({ message: error.message || "Unable to create classroom." });
  }
});


// Derek: Edit accepted disciplines for an existing classroom.
adminRouter.patch(
  "/academics/classrooms/:classroomId/allowed-disciplines",
  async (request, response) => {

    const input = request.body.additionalSubroleIds;

    // Make sure the Admin sent an array.
    if (!Array.isArray(input) || input.length > 30) {
      return response.status(400).json({
        message: "Provide a list of additional disciplines."
      });
    }

    const additionalIds = input.map(Number);

    // Validate the numeric IDs.
    if (additionalIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0
    )) {
      return response.status(400).json({
        message: "Invalid discipline IDs."
      });
    }

    try {
      const context = await requireAdmin(request, response);
      if (!context) return;

      const { supabaseAdmin, actor } = context;

      if (!(await ensureAuditLogReady(supabaseAdmin, response))) {
        return;
      }

      const school = supabaseAdmin.schema("school");

      // Step 1: Find the classroom.
      const { data: classroom, error: classroomError } =
        await school
          .from("classrooms")
          .select("id, short_name, discipline_subrole_id")
          .eq("id", request.params.classroomId)
          .maybeSingle();

      if (classroomError) throw classroomError;

      if (!classroom) {
        return response.status(404).json({
          message: "Classroom not found."
        });
      }

      // Step 2: Always include the primary discipline.
      const allowedIds = [
        ...new Set([
          classroom.discipline_subrole_id,
          ...additionalIds
        ])
      ];

      // Step 3: Confirm these disciplines exist.
      const { data: validSubroles, error: validError } =
        await supabaseAdmin
          .from("subroles")
          .select("id")
          .in("id", allowedIds);

      if (validError) throw validError;

      if ((validSubroles || []).length !== allowedIds.length) {
        return response.status(400).json({
          message: "One or more disciplines do not exist."
        });
      }

      // Step 4: Check the students already enrolled.
      const { data: enrollments, error: enrollmentError } =
        await school
          .from("classroom_enrollments")
          .select("student_id")
          .eq("classroom_id", classroom.id)
          .eq("status", "active");

      if (enrollmentError) throw enrollmentError;

      const enrolledIds = (enrollments || []).map(
        (row) => row.student_id
      );

      // Prevent removal of a discipline that currently
      // has students enrolled in this classroom.
      if (enrolledIds.length > 0) {
        const { data: profiles, error: profileError } =
          await supabaseAdmin
            .from("profiles")
            .select("id, sub_role_id")
            .in("id", enrolledIds);

        if (profileError) throw profileError;

        const hasDisallowedStudent =
          (profiles || []).length !== enrolledIds.length ||
          (profiles || []).some(
            (profile) => !allowedIds.includes(profile.sub_role_id)
          );

        if (hasDisallowedStudent) {
          return response.status(409).json({
            message:
              "Cannot remove a discipline while its students are enrolled."
          });
        }
      }

      // Step 5: Get the existing accepted disciplines.
      const { data: existingRows, error: existingError } =
        await school
          .from("classroom_allowed_subroles")
          .select("subrole_id")
          .eq("classroom_id", classroom.id);

      if (existingError) throw existingError;

      const existingIds = (existingRows || []).map(
        (row) => row.subrole_id
      );

      // Determine what needs to be added or removed.
      const toAdd = allowedIds.filter(
        (id) => !existingIds.includes(id)
      );

      const toRemove = existingIds.filter(
        (id) => !allowedIds.includes(id)
      );

      // Step 6: Insert newly accepted disciplines.
      if (toAdd.length > 0) {
        const rows = toAdd.map((id) => ({
          classroom_id: classroom.id,
          subrole_id: id
        }));

        const { error } = await school
          .from("classroom_allowed_subroles")
          .insert(rows);

        if (error) throw error;
      }

      // Step 7: Remove disciplines no longer accepted.
      if (toRemove.length > 0) {
        const { error } = await school
          .from("classroom_allowed_subroles")
          .delete()
          .eq("classroom_id", classroom.id)
          .in("subrole_id", toRemove);

        if (error) throw error;
      }

      // Step 8: Record the Admin's change.
      await writeAuditLog(supabaseAdmin, {
        actor_id: actor.id,
        action: "classroom.disciplines_updated",
        details: {
          classroomId: classroom.id,
          allowedSubroleIds: allowedIds
        }
      });

      return response.json({
        message: "Accepted classroom disciplines updated."
      });

    } catch (error) {
      console.error("Unable to update disciplines:", error);

      return response.status(500).json({
        message: "Unable to update accepted disciplines."
      });
    }
  }
);


adminRouter.post("/students/bulk-invite", async (request, response) => {
  const students = Array.isArray(request.body.students) ? request.body.students.slice(0, 100) : [];
  if (!students.length) return response.status(400).json({ message: "Add at least one student before creating accounts." });

  try {
    const context = await requireAdmin(request, response);
    if (!context) return;
    const { supabaseAdmin, actor } = context;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;
    const [{ data: studentRole, error: roleError }, { data: subroles, error: subroleError }] = await Promise.all([
      supabaseAdmin.from("roles").select("id").eq("name", "Student").single(),
      supabaseAdmin.from("subroles").select("id, name"),
    ]);
    if (roleError || !studentRole || subroleError) throw roleError || subroleError || new Error("Student role is not configured.");
    const allowedSubroleIds = new Set((subroles || []).map((subrole) => subrole.id));
    const created = [];
    const failed = [];

    for (const entry of students) {
      const firstName = String(entry.firstName || "").trim();
      const lastName = String(entry.lastName || "").trim();
      const utepId = String(entry.utepId || "").trim() || null;
      const subroleId = Number(entry.subroleId);
      if (!firstName || !lastName || !allowedSubroleIds.has(subroleId)) {
        failed.push({ name: `${firstName} ${lastName}`.trim() || "Unnamed student", message: "A first name, last name, and discipline are required." });
        continue;
      }
      const temporaryPassword = generateTemporaryPassword();
      let email = "";
      let authData = null;
      let authError = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        email = makeCareflowEmail(firstName, lastName);
        const result = await supabaseAdmin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`,
            must_change_password: true,
          },
        });
        authData = result.data;
        authError = result.error;
        if (!authError || !/already registered|already exists|duplicate/i.test(authError.message || "")) break;
      }
      if (authError || !authData?.user) {
        failed.push({ name: `${firstName} ${lastName}`, message: authError?.message || "Unable to create the Auth account." });
        continue;
      }
      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        utep_id: utepId,
        role_id: studentRole.id,
        sub_role_id: subroleId,
      });
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        failed.push({ name: `${firstName} ${lastName}`, message: profileError.message });
        continue;
      }
      await writeAuditLog(supabaseAdmin, { actor_id: actor.id, target_user_id: authData.user.id, action: "student.bulk_invited", details: { email, subroleId } });
      created.push({ id: authData.user.id, name: `${firstName} ${lastName}`, email, temporaryPassword });
    }
    return response.status(201).json({ created, failed, message: `${created.length} student account${created.length === 1 ? "" : "s"} created.` });
  } catch (error) {
    console.error("Unable to bulk invite students:", error);
    return response.status(500).json({ message: error.message || "Unable to create student accounts." });
  }
});

adminRouter.post("/patients/bulk-create", async (request, response) => {
  const patients = Array.isArray(request.body.patients)
    ? request.body.patients.slice(0, 100)
    : [];

  if (!patients.length) {
    return response.status(400).json({
      message: "Add at least one patient before creating accounts.",
    });
  }

  try {
    const context = await requireAdmin(request, response);
    if (!context) return;

    const { supabaseAdmin, actor } = context;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;

    const { data: patientRole, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "Patient")
      .single();

    if (roleError || !patientRole) {
      throw roleError || new Error("Patient role is not configured.");
    }

    const created = [];
    const failed = [];

    for (const entry of patients) {
      const firstName = String(entry.firstName || "").trim();
      const lastName = String(entry.lastName || "").trim();
      const utepId = String(entry.utepId || "").trim() || null;

      if (!firstName || !lastName) {
        failed.push({
          name: `${firstName} ${lastName}`.trim() || "Unnamed patient",
          message: "A first and last name are required.",
        });
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      let email = "";
      let authData = null;
      let authError = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        email = makeCareflowEmail(firstName, lastName);
        const result = await supabaseAdmin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`,
            must_change_password: true,
          },
        });
        authData = result.data;
        authError = result.error;

        if (!authError || !/already registered|already exists|duplicate/i.test(authError.message || "")) {
          break;
        }
      }

      if (authError || !authData?.user) {
        failed.push({
          name: `${firstName} ${lastName}`,
          message: authError?.message || "Unable to create the Auth account.",
        });
        continue;
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        utep_id: utepId,
        role_id: patientRole.id,
        sub_role_id: null,
      });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        failed.push({ name: `${firstName} ${lastName}`, message: profileError.message });
        continue;
      }

      await writeAuditLog(supabaseAdmin, {
        actor_id: actor.id,
        target_user_id: authData.user.id,
        action: "patient.bulk_created",
        details: { email },
      });
      created.push({
        id: authData.user.id,
        name: `${firstName} ${lastName}`,
        email,
        temporaryPassword,
      });
    }

    return response.status(201).json({
      created,
      failed,
      message: `${created.length} patient account${created.length === 1 ? "" : "s"} created.`,
    });
  } catch (error) {
    console.error("Unable to bulk create patients:", error);
    return response.status(500).json({
      message: error.message || "Unable to create patient accounts.",
    });
  }
});

adminRouter.post("/academics/classrooms/:classroomId/instructors", async (request, response) => {
  try {
    const context = await requireAdmin(request, response);
    if (!context) return;
    const instructorId = String(request.body.instructorId || "");
    const school = context.supabaseAdmin.schema("school");
    const [{ data: classroom, error: classroomError }, { data: profile, error: profileError }] = await Promise.all([
      school.from("classrooms").select("id, discipline_subrole_id").eq("id", request.params.classroomId).single(),
      context.supabaseAdmin.from("profiles").select("id, sub_role_id, roles(name)").eq("id", instructorId).single(),
    ]);
    if (classroomError || profileError || getRelationName(profile?.roles) !== "Instructor" || profile.sub_role_id !== classroom.discipline_subrole_id) {
      return response.status(400).json({ message: "Choose an Instructor with the same discipline as this classroom." });
    }
    const { error } = await school.from("classroom_instructors").insert({ classroom_id: classroom.id, instructor_id: profile.id, access_level: "co_instructor" });
    if (error?.code === "23505") return response.status(400).json({ message: "This Instructor is already assigned to the classroom." });
    if (error) throw error;
    return response.status(201).json({ message: "Instructor assigned to classroom." });
  } catch (error) {
    console.error("Unable to assign instructor:", error);
    return response.status(500).json({ message: "Unable to assign instructor." });
  }
});

adminRouter.post("/users/invite", async (request, response) => {
  const firstName = String(request.body.firstName || "").trim();
  const lastName = String(request.body.lastName || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const utepId = String(request.body.utepId || "").trim() || null;
  const roleId = Number(request.body.roleId);
  const subroleId = request.body.subroleId ? Number(request.body.subroleId) : null;

  if (!firstName || !lastName || !/^[^\s@]+@careflow\.test$/i.test(email) || !roleId) {
    return response.status(400).json({
      message: "Enter a name, a valid @careflow.test email, and an account role.",
    });
  }

  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin, actor } = adminContext;
    const access = await getRoleAndSubrole(supabaseAdmin, roleId, subroleId);
    if (!access || isAdminRole(access.role.name)) {
      return response.status(400).json({
        message: "Administrators cannot create or assign Admin accounts here.",
      });
    }

    // Validate prerequisites before creating an Auth identity, so a missing audit table
    // cannot leave behind a partially provisioned account.
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;

    const { data: invitation, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          display_name: `${firstName} ${lastName}`,
          full_name: `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
        },
        redirectTo: process.env.APP_URL || "http://localhost:5173/set-password",
      });

    if (inviteError || !invitation.user) {
      return response.status(400).json({
        message: inviteError?.message || "Unable to send this invitation.",
      });
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: invitation.user.id,
      first_name: firstName,
      last_name: lastName,
      utep_id: utepId,
      role_id: access.role.id,
      sub_role_id: access.subrole?.id || null,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(invitation.user.id);
      return response.status(500).json({
        message: `Unable to create the Careflow profile: ${profileError.message}`,
      });
    }

    try {
      await writeAuditLog(supabaseAdmin, {
        actor_id: actor.id,
        target_user_id: invitation.user.id,
        action: "account.invited",
        details: { email, role: access.role.name, subrole: access.subrole?.name || null },
      });
    } catch (auditError) {
      console.error(auditError);
    }

    return response.status(201).json({
      message: `Invitation sent to ${email}.`,
    });
  } catch (error) {
    console.error("Unable to invite account:", error);
    return response.status(500).json({ message: "Unable to invite this account." });
  }
});

adminRouter.patch("/users/:userId/access", async (request, response) => {
  const roleId = Number(request.body.roleId);
  const subroleId = request.body.subroleId ? Number(request.body.subroleId) : null;

  if (!roleId) return response.status(400).json({ message: "Choose an account role." });

  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin, actor } = adminContext;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, role_id, sub_role_id, roles(name), subroles(name)")
      .eq("id", request.params.userId)
      .single();
    const access = await getRoleAndSubrole(supabaseAdmin, roleId, subroleId);

    if (targetError || !targetProfile || !access) {
      return response.status(404).json({ message: "The requested account was not found." });
    }
    if (isAdminRole(getRelationName(targetProfile.roles)) || isAdminRole(access.role.name)) {
      return response.status(403).json({
        message: "Admin role assignments are restricted to a separate Super Admin process.",
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ role_id: access.role.id, sub_role_id: access.subrole?.id || null })
      .eq("id", targetProfile.id);
    if (updateError) return response.status(500).json({ message: "Unable to update access." });

    await writeAuditLog(supabaseAdmin, {
      actor_id: actor.id,
      target_user_id: targetProfile.id,
      action: "account.access_updated",
      details: {
        previousRole: getRelationName(targetProfile.roles),
        previousSubrole: getRelationName(targetProfile.subroles) || null,
        role: access.role.name,
        subrole: access.subrole?.name || null,
      },
    });
    return response.json({ message: "Account access updated." });
  } catch (error) {
    console.error("Unable to update account access:", error);
    return response.status(500).json({ message: error.message || "Unable to update access." });
  }
});

adminRouter.post("/users/:userId/password-reset", async (request, response) => {
  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin, actor } = adminContext;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(
      request.params.userId,
    );
    if (targetError || !target.user) return response.status(404).json({ message: "Account not found." });
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("roles(name)")
      .eq("id", target.user.id)
      .single();
    if (isAdminRole(getRelationName(targetProfile?.roles))) {
      return response.status(403).json({ message: "Admin accounts cannot be changed here." });
    }

    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: process.env.APP_URL || "http://localhost:5173/set-password",
    });
    if (resetError) return response.status(400).json({ message: resetError.message });

    await writeAuditLog(supabaseAdmin, {
      actor_id: actor.id,
      target_user_id: target.user.id,
      action: "account.password_reset_requested",
      details: { email: target.user.email },
    });
    return response.json({ message: `A password-reset email was sent to ${target.user.email}.` });
  } catch (error) {
    console.error("Unable to request password reset:", error);
    return response.status(500).json({ message: error.message || "Unable to request a password reset." });
  }
});

adminRouter.patch("/users/:userId/status", async (request, response) => {
  const isActive = Boolean(request.body.isActive);
  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin, actor } = adminContext;
    if (!(await ensureAuditLogReady(supabaseAdmin, response))) return;
    if (actor.id === request.params.userId) {
      return response.status(400).json({ message: "You cannot deactivate your own account." });
    }
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("roles(name)")
      .eq("id", request.params.userId)
      .single();
    if (isAdminRole(getRelationName(targetProfile?.roles))) {
      return response.status(403).json({ message: "Admin accounts cannot be changed here." });
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(request.params.userId, {
      ban_duration: isActive ? "none" : "876000h",
    });
    if (error) return response.status(400).json({ message: error.message });
    await writeAuditLog(supabaseAdmin, {
      actor_id: actor.id,
      target_user_id: request.params.userId,
      action: isActive ? "account.activated" : "account.deactivated",
      details: { isActive },
    });
    return response.json({ message: isActive ? "Account reactivated." : "Account deactivated." });
  } catch (error) {
    console.error("Unable to change account status:", error);
    return response.status(500).json({ message: error.message || "Unable to change account status." });
  }
});

adminRouter.get("/audit-log", async (request, response) => {
  try {
    const adminContext = await requireAdmin(request, response);
    if (!adminContext) return;
    const { supabaseAdmin } = adminContext;
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_id, target_user_id, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) return response.status(503).json({ message: "Run the admin audit-log SQL setup first." });
    return response.json(data || []);
  } catch (error) {
    console.error("Unable to load audit log:", error);
    return response.status(500).json({ message: "Unable to load the audit log." });
  }
});

//Dereks Global Audit Log
//Page for Admins to view all activity in the system. This is a global audit log that shows all activity in the system, not just admin activity. This is useful for tracking down issues and seeing what users are doing in the system.
adminRouter.get("/global-audit-log", async (request, response) => {
  try {
    // Step 1: Make sure the user is an Admin.
    const context = await requireAdmin(request, response);

    if (!context) {
      return;
    }

    const database = context.supabaseAdmin;

    // Step 2: Get the global audit log from the database.
    // Allow a small set of safe page sizes for the Admin table.
    const requestedPageSize = Number(request.query.pageSize);
    const pageSize = [5, 10, 20, 50].includes(requestedPageSize)
      ? requestedPageSize
      : 20;
    const requestedPage = Number(request.query.page);
    const page = Number.isSafeInteger(requestedPage)
      ? Math.max(1, Math.min(requestedPage, 1000))
      : 1;

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;


    // Derek's Global Audit Log search and filters.

    // Read the filters sent from React.
    const search = String(request.query.search || "").trim();
    const role = String(request.query.role || "all");
    const action = String(request.query.action || "all");

    // Only allow recognized roles and actions.
    const allowedRoles = [
      "all", "Student", "Instructor", "Admin", "Patient"
    ];

    const allowedActions = [
      "all",
      "note.created",
      "note.updated",
      "note.submitted",
      "note.reviewed",
      "account.invited",
      "account.activated",
      "account.deactivated",
      "account.access_updated",
      "account.password_reset_requested",
      "classroom.created",
      "student.bulk_invited"
    ];

    if (
      search.length > 80 ||
      !allowedRoles.includes(role) ||
      !allowedActions.includes(action)
    ) {
      return response.status(400).json({
        message: "Invalid audit log filters."
      });
    }

    // Find matching users when a name or role is selected.
    let matchingActorIds = null;

    if (search || role !== "all") {
      let profilesQuery = database
        .from("profiles")
        .select("id, first_name, last_name");

      // Filter profiles by role.
      if (role !== "all") {
        const { data: selectedRole, error: roleError } =
          await database
            .from("roles")
            .select("id")
            .eq("name", role)
            .maybeSingle();

        if (roleError) throw roleError;

        if (!selectedRole) {
          return response.json({
            logs: [], total: 0, page, pageSize
          });
        }

        profilesQuery = profilesQuery.eq("role_id", selectedRole.id);
      }

      // Split names into search words.
      // Example: "Bart Simpson" becomes ["bart", "simpson"].
      const words = search.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

      if (search && words.length === 0) {
        return response.json({
          logs: [], total: 0, page, pageSize
        });
      }

      // Narrow the database search using the first word.
      if (words.length > 0) {
        const firstWord = words[0];

        profilesQuery = profilesQuery.or(
          `first_name.ilike.%${firstWord}%,last_name.ilike.%${firstWord}%`
        );
      }

      const { data: profiles, error: profilesError } =
        await profilesQuery;

      if (profilesError) throw profilesError;

      // Check the full name against every search word.
      matchingActorIds = (profiles || [])
        .filter((profile) => {
          const fullName =
            `${profile.first_name || ""} ${profile.last_name || ""}`
              .toLowerCase();

          return words.every((word) => fullName.includes(word));
        })
        .map((profile) => profile.id);

      // No matching users means no matching audit events.
      if (matchingActorIds.length === 0) {
        return response.json({
          logs: [], total: 0, page, pageSize
        });
      }
    }

    // Build the audit query.
    let auditQuery = database
      .from("admin_audit_log")
      .select(
        "id, actor_id, target_user_id, action, entity_type, entity_id, details, created_at",
        { count: "exact" }
      );

    // Filter by the selected action.
    if (action === "note.updated") {
      // Include our earlier event naming convention.
      auditQuery = auditQuery.in("action", [
        "note.updated", "note.update"
      ]);
    } else if (action !== "all") {
      auditQuery = auditQuery.eq("action", action);
    }

    // Limit events to matching users.
    if (matchingActorIds !== null) {
      auditQuery = auditQuery.in("actor_id", matchingActorIds);
    }

    // Apply sorting and pagination AFTER filtering.
    const { data, error, count } = await auditQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, end);

    if (error) {
      throw error;
    }

    //Display the actual user names in the audit log
    const auditLogs = data || [];

    const actorIds = [
      ...new Set(auditLogs.map((entry) => entry.actor_id))
    ];

    //Find the corresponding profiles
    let profiles = [];

    if (actorIds.length > 0) {
      const { data: userProfiles, error: profileError } =
        await database
          .from("profiles")
          .select("id, first_name, last_name, roles(name)")
          .in("id", actorIds);

      if (profileError) {
        throw profileError;
      }

      profiles = userProfiles || [];
    }

    //Match the each profile to its User ID
    const profileMap = new Map();

    for (const profile of profiles) {
      profileMap.set(profile.id, profile);
    }

    //Add the user name and role to the corresponding audit event
    const logsWithNames = auditLogs.map((entry) => {
      const profile = profileMap.get(entry.actor_id);

      const fullName = profile
        ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
        : "";

      return {
        ...entry,
        actor_name: fullName || "Unknown user",
        actor_role: getRelationName(profile?.roles) || "Role unavailable"
      };
    });

    // Send the records to the frontend, along with pagination information.
    return response.json({
      logs: logsWithNames,
      total: count || 0,
      page: page,
      pageSize: pageSize,
    });
  } catch (error) {
    console.error("Unable to load global audit log:", error);

    return response.status(500).json({
      message: "Unable to load the global audit log.",
    });
  }
});





// ADMIN CLASSROOM AND STUDENT ACTIVITY
// This route lets administrators VIEW activity.
// It does not change classroom or student information.

adminRouter.get("/activity", async (request, response) => {
  try {
    // Step 1: Make sure the user is an Admin.
    const admin = await requireAdmin(request, response);

    if (!admin) {
      return;
    }

    // Step 2: Connect to the existing database.
    const db = admin.supabaseAdmin;

    const school = db.schema("school");
    const learning = db.schema("learning");

    // Step 3: Get all classrooms.
    const classroomsResult = await school
      .from("classrooms")
      .select("id, crn, full_name, short_name, room, term, status")
      .order("id");

    if (classroomsResult.error) {
      throw classroomsResult.error;
    }

    // Get the students enrolled in classrooms.
    const enrollmentsResult = await school
      .from("classroom_enrollments")
      .select("classroom_id, student_id, status");

    if (enrollmentsResult.error) {
      throw enrollmentsResult.error;
    }

    // Get the instructors assigned to classrooms.
    const instructorsResult = await school
      .from("classroom_instructors")
      .select("classroom_id, instructor_id");

    if (instructorsResult.error) {
      throw instructorsResult.error;
    }

    // Get classroom groups.
    const groupsResult = await school
      .from("classroom_groups")
      .select("id, classroom_id");

    if (groupsResult.error) {
      throw groupsResult.error;
    }

    // Get user profiles so we can display names.
    const profilesResult = await db
      .from("profiles")
      .select("id, first_name, last_name, roles(name)");

    if (profilesResult.error) {
      throw profilesResult.error;
    }

    // Get case assignments for students.
    const assignmentsResult = await learning
      .from("student_case_assignments")
      .select("id, student_id, case_id, encounter_status, updated_at");

    if (assignmentsResult.error) {
      throw assignmentsResult.error;
    }

    // Get case titles.
    const casesResult = await learning
      .from("cases")
      .select("id, title");

    if (casesResult.error) {
      throw casesResult.error;
    }

    // Get SOAP note statuses, but not the note contents.
    const notesResult = await learning
      .from("notes")
      .select("id, assignment_id, status, updated_at")
      .eq("note_type", "soap")
      .order("updated_at", { ascending: false });

    if (notesResult.error) {
      throw notesResult.error;
    }

    // Get order information, but not medication details.
    const ordersResult = await learning
      .from("orders")
      .select("id, assignment_id");

    if (ordersResult.error) {
      throw ordersResult.error;
    }

    // Step 4: Give the results shorter names.
    const classrooms = classroomsResult.data || [];
    const enrollments = enrollmentsResult.data || [];
    const instructors = instructorsResult.data || [];
    const groups = groupsResult.data || [];
    const profiles = profilesResult.data || [];
    const assignments = assignmentsResult.data || [];
    const cases = casesResult.data || [];
    const notes = notesResult.data || [];
    const orders = ordersResult.data || [];

    // This function finds a person's name using their ID.
    function findName(userId) {
      const person = profiles.find(
        (profile) => profile.id === userId
      );

      if (!person) {
        return "Unknown user";
      }

      const first = person.first_name || "";
      const last = person.last_name || "";

      return `${first} ${last}`.trim() || "Unnamed user";
    }

    // Step 5: Organize the classroom information.
    const classroomList = classrooms.map((classroom) => {

      // Find enrollments belonging to this classroom.
      const classEnrollments = enrollments.filter(
        (item) => item.classroom_id === classroom.id
      );

      // Find instructors belonging to this classroom.
      const classInstructors = instructors.filter(
        (item) => item.classroom_id === classroom.id
      );

      // Find groups belonging to this classroom.
      const classGroups = groups.filter(
        (item) => item.classroom_id === classroom.id
      );

      // Create a list of enrolled students.
      const students = classEnrollments.map((enrollment) => {
        return {
          id: enrollment.student_id,
          name: findName(enrollment.student_id),
          status: enrollment.status,
        };
      });

      return {
        ...classroom,

        students: students,

        instructorNames: classInstructors.map((instructor) =>
          findName(instructor.instructor_id)
        ),

        studentCount: classEnrollments.length,

        activeStudentCount: classEnrollments.filter(
          (item) => item.status === "active"
        ).length,

        groupCount: classGroups.length,
      };
    });

    // Step 6: Organize the student case activity.
    const activity = assignments.map((assignment) => {

      // Find the case assigned to this student.
      const patientCase = cases.find(
        (item) => item.id === assignment.case_id
      );

      // Notes are sorted newest first.
      // find() will return the most recently updated one.
      const note = notes.find(
        (item) => item.assignment_id === assignment.id
      );

      // Find orders for this assignment.
      const assignmentOrders = orders.filter(
        (item) => item.assignment_id === assignment.id
      );

      return {
        id: assignment.id,
        studentId: assignment.student_id,
        studentName: findName(assignment.student_id),
        caseTitle: patientCase?.title || "Untitled case",
        encounterStatus:
          assignment.encounter_status || "Not started",
        noteStatus: note?.status || "Not started",
        orderCount: assignmentOrders.length,
        lastUpdated:
          note?.updated_at || assignment.updated_at || null,
      };
    });

    // Put recently updated case records first.
    activity.sort((a, b) => {
      const firstDate = a.lastUpdated || "";
      const secondDate = b.lastUpdated || "";

      return secondDate.localeCompare(firstDate);
    });

    // Step 7: Calculate totals for the overview.
    const studentProfiles = profiles.filter(
      (profile) => getRelationName(profile.roles) === "Student"
    );

    const metrics = {
      classrooms: classrooms.length,
      students: studentProfiles.length,
      enrollments: enrollments.length,
      assignments: assignments.length,
      soapNotes: notes.length,
    };

    // Step 8: Send the information to React.
    return response.json({
      metrics: metrics,
      classrooms: classroomList,
      activity: activity,
    });

  } catch (error) {
    console.error("Admin activity error:", error);

    return response.status(500).json({
      message: "Unable to load Admin activity.",
    });
  }
});


export default adminRouter;
