import { Router } from "express";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";
import { writeAuditLog } from "../services/auditLog.js";

const instructorRouter = Router();

function relationName(relation) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

function accessToken(request) {
  return (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

function formatProfile(profile) {
  return {
    id: profile.id,
    name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
    subrole: relationName(profile.subroles) || null,
    utepId: profile.utep_id || null,
  };
}

async function requireInstructor(request, response) {
  const token = accessToken(request);
  if (!token) {
    response.status(401).json({ message: "Missing access token." });
    return null;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    response.status(401).json({ message: "Your session has expired." });
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role_id, sub_role_id, roles(name), subroles(name)")
    .eq("id", authData.user.id)
    .single();

  if (profileError || relationName(profile?.roles) !== "Instructor") {
    response.status(403).json({ message: "Instructor access is required." });
    return null;
  }
  if (!profile.sub_role_id) {
    response.status(403).json({
      message: "Your Instructor profile needs a subrole before you can manage classrooms.",
    });
    return null;
  }

  return { supabaseAdmin, profile };
}

async function getInstructorClassrooms(supabaseAdmin, instructorId) {
  const school = supabaseAdmin.schema("school");
  const { data: memberships, error: membershipError } = await school
    .from("classroom_instructors")
    .select("classroom_id, access_level")
    .eq("instructor_id", instructorId);
  if (membershipError) throw membershipError;

  const classroomIds = (memberships || []).map((membership) => membership.classroom_id);
  if (!classroomIds.length) return [];

  const { data: classrooms, error: classroomError } = await school
    .from("classrooms")
    .select("id, crn, full_name, short_name, room, term, discipline_subrole_id, status, created_at")
    .in("id", classroomIds)
    .order("created_at", { ascending: false });
  if (classroomError) throw classroomError;

  const disciplineIds = [...new Set(classrooms.map((classroom) => classroom.discipline_subrole_id))];
  const { data: subroles, error: subroleError } = await supabaseAdmin
    .from("subroles")
    .select("id, name")
    .in("id", disciplineIds);
  if (subroleError) throw subroleError;

  const disciplineNames = new Map((subroles || []).map((subrole) => [subrole.id, subrole.name]));
  const accessLevels = new Map((memberships || []).map((membership) => [membership.classroom_id, membership.access_level]));
  return (classrooms || []).map((classroom) => ({
    ...classroom,
    discipline: disciplineNames.get(classroom.discipline_subrole_id) || "Unassigned discipline",
    accessLevel: accessLevels.get(classroom.id) || "co_instructor",
  }));
}

async function verifyClassroomAccess(supabaseAdmin, profile, classroomId) {
  const school = supabaseAdmin.schema("school");
  const { data: membership, error: membershipError } = await school
    .from("classroom_instructors")
    .select("access_level")
    .eq("classroom_id", classroomId)
    .eq("instructor_id", profile.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;

  const { data: classroom, error: classroomError } = await school
    .from("classrooms")
    .select("id, crn, full_name, short_name, room, term, discipline_subrole_id, status")
    .eq("id", classroomId)
    .single();
  if (classroomError) throw classroomError;
  if (classroom.discipline_subrole_id !== profile.sub_role_id) return null;

  return { classroom, accessLevel: membership.access_level };
}

async function eligibleStudents(supabaseAdmin, subroleId) {
  const { data: studentRole, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("name", "Student")
    .single();
  if (roleError || !studentRole) throw roleError || new Error("Student role is not configured.");

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, utep_id, subroles(name)")
    .eq("role_id", studentRole.id)
    .eq("sub_role_id", subroleId)
    .order("last_name");
  if (error) throw error;
  return (data || []).map(formatProfile);
}


 // Derek cross-discipline classroom eligibility.
async function eligibleStudentsForClassroom(supabaseAdmin, classroomId) {

  // Find every discipline accepted by this classroom.
  const { data: allowedDisciplines, error: disciplineError } =
    await supabaseAdmin
      .schema("school")
      .from("classroom_allowed_subroles")
      .select("subrole_id")
      .eq("classroom_id", classroomId);

  if (disciplineError) {
    throw disciplineError;
  }

  // Collect the accepted discipline IDs.
  const allowedIds = (allowedDisciplines || []).map(
    (item) => item.subrole_id
  );

  if (allowedIds.length === 0) {
    return [];
  }

  // Step 2: Find the Student role.
  const { data: studentRole, error: roleError } =
    await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "Student")
      .single();

  if (roleError) {
    throw roleError;
  }

  // Step 3: Find students belonging to ANY accepted discipline.
  const { data: students, error: studentError } =
    await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, utep_id, subroles(name)")
      .eq("role_id", studentRole.id)
      .in("sub_role_id", allowedIds)
      .order("last_name");

  if (studentError) {
    throw studentError;
  }

  return (students || []).map(formatProfile);
}


instructorRouter.get("/dashboard", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const classrooms = await getInstructorClassrooms(context.supabaseAdmin, context.profile.id);
    const school = context.supabaseAdmin.schema("school");
    const classroomIds = classrooms.map((classroom) => classroom.id);
    const [{ data: enrollments, error: enrollmentError }, { data: groups, error: groupError }] =
      classroomIds.length
        ? await Promise.all([
            school.from("classroom_enrollments").select("classroom_id").in("classroom_id", classroomIds).eq("status", "active"),
            school.from("classroom_groups").select("classroom_id").in("classroom_id", classroomIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
    if (enrollmentError || groupError) throw enrollmentError || groupError;

    const enrollmentCounts = (enrollments || []).reduce((counts, enrollment) => {
      counts[enrollment.classroom_id] = (counts[enrollment.classroom_id] || 0) + 1;
      return counts;
    }, {});
    const groupCounts = (groups || []).reduce((counts, group) => {
      counts[group.classroom_id] = (counts[group.classroom_id] || 0) + 1;
      return counts;
    }, {});

    return response.json({
      discipline: relationName(context.profile.subroles),
      metrics: {
        learners: (enrollments || []).length,
        activeClassrooms: classrooms.filter((classroom) => classroom.status === "active").length,
        draftClassrooms: classrooms.filter((classroom) => classroom.status === "draft").length,
      },
      classrooms: classrooms.map((classroom) => ({
        ...classroom,
        learnerCount: enrollmentCounts[classroom.id] || 0,
        groupCount: groupCounts[classroom.id] || 0,
      })),
    });
  } catch (error) {
    console.error("Unable to load instructor dashboard:", error);
    return response.status(500).json({ message: "Unable to load your instructor dashboard." });
  }
});

instructorRouter.get("/classrooms", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const classrooms = await getInstructorClassrooms(context.supabaseAdmin, context.profile.id);
    return response.json({ classrooms, discipline: relationName(context.profile.subroles) });
  } catch (error) {
    console.error("Unable to load classrooms:", error);
    return response.status(500).json({ message: "Unable to load your classrooms." });
  }
});

instructorRouter.get("/eligible-students", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const students = await eligibleStudents(context.supabaseAdmin, context.profile.sub_role_id);
    return response.json({
      discipline: relationName(context.profile.subroles),
      students,
    });
  } catch (error) {
    console.error("Unable to load eligible students:", error);
    return response.status(500).json({ message: "Unable to load eligible students." });
  }
});

instructorRouter.get("/classrooms/:classroomId", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const access = await verifyClassroomAccess(
      context.supabaseAdmin,
      context.profile,
      request.params.classroomId,
    );
    if (!access) return response.status(404).json({ message: "Classroom not found." });

    const school = context.supabaseAdmin.schema("school");
    const [{ data: enrollments, error: enrollmentError }, { data: groups, error: groupError }, eligible] =
      await Promise.all([
        school.from("classroom_enrollments").select("student_id, status").eq("classroom_id", access.classroom.id).eq("status", "active"),
        school.from("classroom_groups").select("id, name").eq("classroom_id", access.classroom.id).order("name"),
        eligibleStudentsForClassroom(context.supabaseAdmin, access.classroom.id),
      ]);
    if (enrollmentError || groupError) throw enrollmentError || groupError;

    const enrolledIds = (enrollments || []).map((enrollment) => enrollment.student_id);
    const enrolled = eligible.filter((student) => enrolledIds.includes(student.id));
    const availableStudents = eligible.filter((student) => !enrolledIds.includes(student.id));
    const groupIds = (groups || []).map((group) => group.id);
    const { data: groupMembers, error: groupMemberError } = groupIds.length
      ? await school
          .from("classroom_group_members")
          .select("group_id, student_id")
          .in("group_id", groupIds)
      : { data: [], error: null };
    if (groupMemberError) throw groupMemberError;
    const studentsById = new Map(enrolled.map((student) => [student.id, student]));
    const membersByGroup = (groupMembers || []).reduce((members, member) => {
      const group = members.get(member.group_id) || [];
      const student = studentsById.get(member.student_id);
      if (student) group.push(student);
      members.set(member.group_id, group);
      return members;
    }, new Map());

    return response.json({
      classroom: { ...access.classroom, discipline: relationName(context.profile.subroles) },
      accessLevel: access.accessLevel,
      students: enrolled,
      availableStudents,
      groups: (groups || []).map((group) => ({
        ...group,
        students: membersByGroup.get(group.id) || [],
      })),
    });
  } catch (error) {
    console.error("Unable to load classroom:", error);
    return response.status(500).json({ message: "Unable to load this classroom." });
  }
});


 // Derek: Enroll eligible students in an existing classroom.
instructorRouter.post(
  "/classrooms/:classroomId/enrollments",
  async (request, response) => {

    const input = request.body.studentIds;

    if (
      !Array.isArray(input) ||
      input.length === 0 ||
      input.length > 30 ||
      input.some((id) => typeof id !== "string" || !id.trim())
    ) {
      return response.status(400).json({
        message: "Select between 1 and 30 students."
      });
    }

    // Prevent duplicate student IDs.
    const studentIds = [...new Set(input)];

    try {
      // Step 1: Verify the Instructor.
      const context = await requireInstructor(request, response);
      if (!context) return;

      // Step 2: Verify their classroom access.
      const access = await verifyClassroomAccess(
        context.supabaseAdmin,
        context.profile,
        request.params.classroomId
      );

      if (!access) {
        return response.status(404).json({
          message: "Classroom not found."
        });
      }

      if (access.classroom.status !== "active") {
        return response.status(400).json({
          message: "This classroom is not active."
        });
      }

      // Step 3: Find all students eligible for this classroom.
      const eligible = await eligibleStudentsForClassroom(
        context.supabaseAdmin,
        access.classroom.id
      );

      const eligibleIds = new Set(
        eligible.map((student) => student.id)
      );

      // Never trust IDs received from the React form alone.
      if (!studentIds.every((id) => eligibleIds.has(id))) {
        return response.status(400).json({
          message: "One or more students are not eligible."
        });
      }

      const school = context.supabaseAdmin.schema("school");

      // Step 4: Check for existing enrollment records.
      const { data: existing, error: existingError } =
        await school
          .from("classroom_enrollments")
          .select("student_id, status")
          .eq("classroom_id", access.classroom.id)
          .in("student_id", studentIds);

      if (existingError) throw existingError;

      // Do not enroll someone who is already active.
      if ((existing || []).some(
        (row) => row.status === "active"
      )) {
        return response.status(409).json({
          message: "A selected student is already enrolled."
        });
      }

      // Step 5: Reactivate existing inactive enrollments.
      for (const row of existing || []) {
        const { error } = await school
          .from("classroom_enrollments")
          .update({ status: "active" })
          .eq("classroom_id", access.classroom.id)
          .eq("student_id", row.student_id);

        if (error) throw error;
      }

      // Step 6: Insert students not previously enrolled.
      const previousIds = new Set(
        (existing || []).map((row) => row.student_id)
      );

      const newIds = studentIds.filter(
        (id) => !previousIds.has(id)
      );

      if (newIds.length > 0) {
        const enrollmentRows = newIds.map((studentId) => ({
          classroom_id: access.classroom.id,
          student_id: studentId
        }));

        const { error } = await school
          .from("classroom_enrollments")
          .insert(enrollmentRows);

        if (error) throw error;
      }

      return response.status(201).json({
        message:
          `${studentIds.length} student(s) enrolled successfully.`
      });

    } catch (error) {
      console.error("Unable to enroll students:", error);

      return response.status(500).json({
        message: "Unable to enroll students."
      });
    }
  }
);


instructorRouter.post("/classrooms/:classroomId/groups", async (request, response) => {
  const name = String(request.body.name || "").trim();
  const studentIds = [...new Set(Array.isArray(request.body.studentIds) ? request.body.studentIds : [])];
  if (!name || !studentIds.length) {
    return response.status(400).json({ message: "Enter a group name and select at least one enrolled student." });
  }

  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const access = await verifyClassroomAccess(
      context.supabaseAdmin,
      context.profile,
      request.params.classroomId,
    );
    if (!access) return response.status(404).json({ message: "Classroom not found." });

    const school = context.supabaseAdmin.schema("school");
    const { data: enrollments, error: enrollmentError } = await school
      .from("classroom_enrollments")
      .select("student_id")
      .eq("classroom_id", access.classroom.id)
      .eq("status", "active");
    if (enrollmentError) throw enrollmentError;
    const enrolledIds = new Set((enrollments || []).map((enrollment) => enrollment.student_id));
    if (!studentIds.every((studentId) => enrolledIds.has(studentId))) {
      return response.status(400).json({ message: "Groups may contain only students enrolled in this classroom." });
    }

    const { data: existingGroups, error: existingGroupsError } = await school
      .from("classroom_groups")
      .select("id")
      .eq("classroom_id", access.classroom.id);
    if (existingGroupsError) throw existingGroupsError;

    const existingGroupIds = (existingGroups || []).map((group) => group.id);
    if (existingGroupIds.length) {
      const { data: existingMembers, error: existingMembersError } = await school
        .from("classroom_group_members")
        .select("student_id")
        .in("group_id", existingGroupIds)
        .in("student_id", studentIds);
      if (existingMembersError) throw existingMembersError;
      if (existingMembers?.length) {
        return response.status(409).json({
          message: "One or more selected students already belong to another group in this classroom.",
        });
      }
    }

    const { data: group, error: groupError } = await school
      .from("classroom_groups")
      .insert({ classroom_id: access.classroom.id, name })
      .select("id, name")
      .single();
    if (groupError) return response.status(400).json({ message: groupError.message });

    const { error: memberError } = await school.from("classroom_group_members").insert(
      studentIds.map((studentId) => ({
        group_id: group.id,
        classroom_id: access.classroom.id,
        student_id: studentId,
      })),
    );
    if (memberError) {
      await school.from("classroom_groups").delete().eq("id", group.id);
      throw memberError;
    }

    return response.status(201).json({ message: `${name} has been created.`, group });
  } catch (error) {
    console.error("Unable to create classroom group:", error);
    return response.status(500).json({ message: "Unable to create this group." });
  }
});

instructorRouter.post("/classrooms/:classroomId/groups/:groupId/members", async (request, response) => {
  const studentIds = [...new Set(Array.isArray(request.body.studentIds) ? request.body.studentIds : [])];
  if (!studentIds.length) {
    return response.status(400).json({ message: "Select at least one student to add." });
  }

  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const access = await verifyClassroomAccess(
      context.supabaseAdmin,
      context.profile,
      request.params.classroomId,
    );
    if (!access) return response.status(404).json({ message: "Classroom not found." });

    const school = context.supabaseAdmin.schema("school");
    const { data: group, error: groupError } = await school
      .from("classroom_groups")
      .select("id, name")
      .eq("id", request.params.groupId)
      .eq("classroom_id", access.classroom.id)
      .single();
    if (groupError || !group) return response.status(404).json({ message: "Group not found." });

    const { data: enrollments, error: enrollmentError } = await school
      .from("classroom_enrollments")
      .select("student_id")
      .eq("classroom_id", access.classroom.id)
      .eq("status", "active");
    if (enrollmentError) throw enrollmentError;
    const enrolledIds = new Set((enrollments || []).map((enrollment) => enrollment.student_id));
    if (!studentIds.every((studentId) => enrolledIds.has(studentId))) {
      return response.status(400).json({ message: "Only active classroom members can be added to a group." });
    }

    const { data: existingMembers, error: existingMembersError } = await school
      .from("classroom_group_members")
      .select("student_id")
      .eq("classroom_id", access.classroom.id)
      .in("student_id", studentIds);
    if (existingMembersError) throw existingMembersError;
    if (existingMembers?.length) {
      return response.status(409).json({
        message: "One or more selected students already belong to a group in this classroom.",
      });
    }

    const { error: memberError } = await school.from("classroom_group_members").insert(
      studentIds.map((studentId) => ({
        group_id: group.id,
        classroom_id: access.classroom.id,
        student_id: studentId,
      })),
    );
    if (memberError) return response.status(400).json({ message: memberError.message });
    return response.status(201).json({ message: `Members added to ${group.name}.` });
  } catch (error) {
    console.error("Unable to add group members:", error);
    return response.status(500).json({ message: "Unable to add group members." });
  }
});

instructorRouter.post("/classrooms", async (request, response) => {
  const crn = String(request.body.crn || "").trim();
  const fullName = String(request.body.fullName || "").trim();
  const shortName = String(request.body.shortName || "").trim();
  const room = String(request.body.room || "").trim() || null;
  const term = String(request.body.term || "").trim();
  const studentIds = [...new Set(Array.isArray(request.body.studentIds) ? request.body.studentIds : [])];

  if (!crn || !fullName || !shortName || !term) {
    return response.status(400).json({ message: "Enter a CRN, full name, short name, and term." });
  }

  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const eligible = await eligibleStudents(context.supabaseAdmin, context.profile.sub_role_id);
    const eligibleIds = new Set(eligible.map((student) => student.id));
    if (!studentIds.every((studentId) => eligibleIds.has(studentId))) {
      return response.status(400).json({
        message: "Students must have the Student role and the same discipline as this classroom.",
      });
    }

    const school = context.supabaseAdmin.schema("school");
    const { data: classroom, error: classroomError } = await school
      .from("classrooms")
      .insert({
        crn,
        full_name: fullName,
        short_name: shortName,
        room,
        term,
        discipline_subrole_id: context.profile.sub_role_id,
        created_by: context.profile.id,
        status: "active",
      })
      .select("id, crn, full_name, short_name, room, term, discipline_subrole_id, status")
      .single();
    if (classroomError) return response.status(400).json({ message: classroomError.message });


    // Derek cross-discipline classroom creation.
    // Automatically add the instructor's discipline as an accepted discipline for the new classroom.

    const { error: allowedDisciplineError } = await school
      .from("classroom_allowed_subroles")
      .insert({
        classroom_id: classroom.id,
        subrole_id: context.profile.sub_role_id
      });

    if (allowedDisciplineError) {
      console.error(
        "Unable to save classroom discipline:",
        allowedDisciplineError
      );

      // Undo classroom creation if the discipline insert fails.
      const { error: cleanupError } = await school
        .from("classrooms")
        .delete()
        .eq("id", classroom.id);

      if (cleanupError) {
        console.error(
          "Unable to undo classroom creation:",
          cleanupError
        );
      }

      return response.status(500).json({
        message: "Unable to register the classroom's discipline."
      });
    }


    const { error: instructorError } = await school.from("classroom_instructors").insert({
      classroom_id: classroom.id,
      instructor_id: context.profile.id,
      access_level: "owner",
    });
    if (instructorError) {
      await school.from("classrooms").delete().eq("id", classroom.id);
      throw instructorError;
    }

    if (studentIds.length) {
      const { error: enrollmentError } = await school.from("classroom_enrollments").insert(
        studentIds.map((studentId) => ({ classroom_id: classroom.id, student_id: studentId })),
      );
      if (enrollmentError) {
        await school.from("classrooms").delete().eq("id", classroom.id);
        throw enrollmentError;
      }
    }

    return response.status(201).json({
      classroom: { ...classroom, discipline: relationName(context.profile.subroles) },
      message: `${shortName} has been created.`,
    });
  } catch (error) {
    console.error("Unable to create classroom:", error);
    return response.status(500).json({ message: "Unable to create this classroom." });
  }
});

async function getReviewAssignment(admin, profile, assignmentId) {
  const { data: assignment, error } = await admin
    .schema("learning")
    .from("student_case_assignments")
    .select("id, student_id, case_id, classroom_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) throw error;

  // an assignment with no class can't be tied to an instructor yet.
  if (!assignment?.classroom_id) return null;

  // the instructor must teach the assignment's own class, and the class
  // discipline must match theirs (verifyClassroomAccess checks both)
  const access = await verifyClassroomAccess(
    admin,
    profile,
    assignment.classroom_id
  );
  if (!access) return null;

  return assignment;
}

instructorRouter.get("/submissions", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;

    const { supabaseAdmin: admin, profile } = context;

    const { data: notes, error: notesError } =
      await admin
        .schema("learning")
        .from("notes")
        .select("id, assignment_id, note_type, status, updated_at")
        .in("status", ["Pending Review", "Approved", "Returned"])
        .order("updated_at", { ascending: false });

    if (notesError) throw notesError;

    const submissions = [];

    for (const note of notes || []) {
      const assignment = await getReviewAssignment(
        admin,
        profile,
        note.assignment_id
      );

      if (!assignment) continue;

      const [studentResult, caseResult] = await Promise.all([
        admin
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("id", assignment.student_id)
          .maybeSingle(),
        admin
          .schema("learning")
          .from("cases")
          .select("id, title, patient_name")
          .eq("id", assignment.case_id)
          .maybeSingle(),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (caseResult.error) throw caseResult.error;

      submissions.push({
        id: note.id,
        assignmentId: assignment.id,
        classroomId: assignment.classroom_id,
        noteType: note.note_type,
        status: note.status,
        updatedAt: note.updated_at,
        student: studentResult.data
          ? {
              id: studentResult.data.id,
              name: [
                studentResult.data.first_name,
                studentResult.data.last_name,
              ].filter(Boolean).join(" "),
            }
          : null,
        patientCase: caseResult.data,
      });
    }

    return response.json({ submissions });
  } catch (error) {
    console.error("Unable to load submissions:", error);
    return response.status(500).json({
      message: "Unable to load student submissions.",
    });
  }
});


instructorRouter.get(
  "/submissions/:assignmentId",
  async (request, response) => {
    try {
      const context = await requireInstructor(request, response);
      if (!context) return;

      const { supabaseAdmin: admin, profile } = context;

      const assignment = await getReviewAssignment(
        admin,
        profile,
        request.params.assignmentId
      );

      if (!assignment) {
        return response.status(404).json({
          message: "Submission not found or access denied.",
        });
      }

      const [noteResult, ordersResult, studentResult, caseResult] =
        await Promise.all([
          admin
            .schema("learning")
            .from("notes")
            .select("*")
            .eq("assignment_id", assignment.id)
            .in("status", [
              "Pending Review",
              "Approved",
              "Returned",
            ])
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          admin
            .schema("learning")
            .from("orders")
            .select("*")
            .eq("assignment_id", assignment.id)
            .order("id"),
          admin
            .from("profiles")
            .select("id, first_name, last_name")
            .eq("id", assignment.student_id)
            .maybeSingle(),
          admin
            .schema("learning")
            .from("cases")
            .select("*")
            .eq("id", assignment.case_id)
            .maybeSingle(),
        ]);

      const queryError =
        noteResult.error ||
        ordersResult.error ||
        studentResult.error ||
        caseResult.error;

      if (queryError) throw queryError;

      if (!noteResult.data) {
        return response.status(404).json({
          message: "No submitted note found.",
        });
      }

      return response.json({
        assignmentId: assignment.id,
        note: noteResult.data,
        orders: ordersResult.data || [],
        student: studentResult.data,
        patientCase: caseResult.data,
      });
    } catch (error) {
      console.error("Unable to load submission:", error);
      return response.status(500).json({
        message: "Unable to load this submission.",
      });
    }
  }
);

instructorRouter.patch(
  "/submissions/:assignmentId/review",
  async (request, response) => {
    try {
      const context = await requireInstructor(request, response);
      if (!context) return;

      const { supabaseAdmin: admin, profile } = context;
      const { decision } = request.body || {};

            if (!["Approved", "Returned"].includes(decision)) {
        return response.status(400).json({
          message: "Decision must be Approved or Returned.",
        });
      }

      // Instructor feedback. A return must explain what to revise.
      const comments = String(request.body?.comments || "").trim().slice(0, 2000);
      if (decision === "Returned" && !comments) {
        return response.status(400).json({
          message: "Add feedback explaining what the student should revise.",
        });
      }

      const assignment = await getReviewAssignment(
        admin,
        profile,
        request.params.assignmentId
      );

      if (!assignment) {
        return response.status(404).json({
          message: "Submission not found or access denied.",
        });
      }

      const { data: note, error: noteError } =
        await admin
          .schema("learning")
          .from("notes")
          .select("id, status")
          .eq("assignment_id", assignment.id)
          .eq("status", "Pending Review")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (noteError) throw noteError;

      if (!note) {
        return response.status(409).json({
          message: "No pending submission available for review.",
        });
      }

      const { data: reviewedNote, error: updateError } =
        await admin
          .schema("learning")
          .from("notes")
          .update({
            status: decision,
            updated_at: new Date().toISOString(),
          })
          .eq("id", note.id)
          .eq("status", "Pending Review")
          .select()
          .maybeSingle();

      if (updateError) throw updateError;

      if (!reviewedNote) {
        return response.status(409).json({
          message: "Submission has already been reviewed.",
        });
      }

      // save the decision and comments, if this fails, undo the status
      // change so a decision never exists without its record.
      const { error: reviewError } = await admin
        .schema("learning")
        .from("note_reviews")
        .insert({
          note_id: reviewedNote.id,
          reviewer_id: profile.id,
          decision,
          comments: comments || null,
        });

      if (reviewError) {
        await admin
          .schema("learning")
          .from("notes")
          .update({ status: "Pending Review" })
          .eq("id", reviewedNote.id);
        throw reviewError;
      }

      //Dereks audit log for submission review
      //Record the review action in the audit log
      try {
        await writeAuditLog(
          admin, {
            actor_id: profile.id,
            action: "note.reviewed",
            entity_type: "clinical_note",
            entity_id: String(reviewedNote.id),
            details: {
              assignment_id: assignment.id,
              decision: decision,
            }
          }
        );
        console.log("Audit log entry created for note review.");
      } catch (error) {
        console.error("Error writing audit log:", error);
      }

      return response.json({
        message:
          decision === "Approved"
            ? "Submission approved."
            : "Submission returned for revision.",
        note: reviewedNote,
      });
    } catch (error) {
      console.error("Unable to review submission:", error);
      return response.status(500).json({
        message: "Unable to review this submission.",
      });
    }
  });

// ---- Create a case and assign it to students in a classroom ----
const ASSIGNABLE_NOTE_TYPES = ["soap", "sbar"];

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanList(value, maxItems = 20, maxLength = 300) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanCriteria(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      description: cleanText(item?.description, 300),
      points: Number(item?.points),
    }))
    .filter((item) => item.description)
    .slice(0, 30);
}

function ageFromDob(dob) {
  const birth = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

instructorRouter.post("/classrooms/:classroomId/assignments", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const { supabaseAdmin: admin, profile } = context;

    // The instructor must teach this class (the class id comes from the URL).
    const access = await verifyClassroomAccess(admin, profile, request.params.classroomId);
    if (!access) {
      return response.status(404).json({ message: "Classroom not found." });
    }

    const body = request.body || {};
    const input = body.patientCase || {};
    const expectations = body.expectations || {};

    const title = cleanText(input.title, 120);
    const patientName = cleanText(input.patientName, 120);
    const noteType = String(body.noteType || "soap");
    const studentIds = [...new Set(Array.isArray(body.studentIds) ? body.studentIds : [])];

    if (!title || !patientName) {
      return response.status(400).json({ message: "Enter a case title and a patient name." });
    }
    if (!ASSIGNABLE_NOTE_TYPES.includes(noteType)) {
      return response.status(400).json({ message: "That note type is not available yet." });
    }
    if (!studentIds.length) {
      return response.status(400).json({ message: "Select at least one student." });
    }

    let patientAge = null;
    if (input.patientAge !== "" && input.patientAge != null) {
      patientAge = Number(input.patientAge);
      if (!Number.isInteger(patientAge) || patientAge < 0 || patientAge > 120) {
        return response.status(400).json({ message: "Age must be a whole number from 0 to 120." });
      }
    }

        let dateOfBirth = null;
    if (input.dateOfBirth) {
      const dob = String(input.dateOfBirth).trim();
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
        Number.isNaN(Date.parse(`${dob}T00:00:00Z`)) ||
        dob > new Date().toISOString().slice(0, 10)
      ) {
        return response.status(400).json({ message: "Enter a valid date of birth." });
      }
      dateOfBirth = dob;
      if (patientAge === null) patientAge = ageFromDob(dob);
    }

    const criteria = cleanCriteria(expectations.rubricCriteria);
    if (criteria.some((item) => !Number.isFinite(item.points) || item.points < 0 || item.points > 1000)) {
      return response.status(400).json({ message: "Each rubric criterion needs points from 0 to 1000." });
    }

    let dueAt = null;
    if (body.dueAt) {
      const parsed = new Date(body.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return response.status(400).json({ message: "Enter a valid due date." });
      }
      dueAt = parsed.toISOString();
    }

    // Every selected student must be actively enrolled in THIS class.
    const { data: enrollments, error: enrollmentError } = await admin
      .schema("school")
      .from("classroom_enrollments")
      .select("student_id")
      .eq("classroom_id", access.classroom.id)
      .eq("status", "active")
      .in("student_id", studentIds);
    if (enrollmentError) throw enrollmentError;

    const enrolledIds = new Set((enrollments || []).map((row) => row.student_id));
    if (!studentIds.every((id) => enrolledIds.has(id))) {
      return response.status(400).json({
        message: "Some selected students are not enrolled in this classroom.",
      });
    }

    const learning = admin.schema("learning");

    // 1. The case
    const { data: createdCase, error: caseError } = await learning
      .from("cases")
      .insert({
        title,
        patient_name: patientName,
        patient_age: patientAge,
        date_of_birth: dateOfBirth,
        patient_sex: cleanText(input.patientSex, 40) || null,
        chief_complaint: cleanText(input.chiefComplaint, 500) || null,
        history: cleanText(input.history, 2000) || null,
        medications: cleanList(input.medications),
        allergies: cleanList(input.allergies),
        results: cleanText(input.results, 1000) || null,
        starting_encounter_status: "Scheduled",
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (caseError) throw caseError;

    // Deleting the case also removes its expectations and rubric (on delete cascade).
    async function undoCase() {
      await learning.from("cases").delete().eq("id", createdCase.id);
    }

    try {
      // 2. Instructor-only answer key
      const expectedDiagnoses = cleanList(expectations.expectedDiagnoses);
      const instructorNotes = cleanText(expectations.instructorNotes, 2000) || null;

      if (expectedDiagnoses.length || instructorNotes) {
        const { error: expectationsError } = await learning
          .from("case_expectations")
          .insert({
            case_id: createdCase.id,
            expected_diagnoses: expectedDiagnoses,
            instructor_notes: instructorNotes,
          });
        if (expectationsError) throw expectationsError;
      }

      // 3. Rubric criteria with points
      if (criteria.length) {
        const { error: criteriaError } = await learning
          .from("rubric_criteria")
          .insert(
            criteria.map((item, index) => ({
              case_id: createdCase.id,
              position: index,
              description: item.description,
              max_points: item.points,
            })),
          );
        if (criteriaError) throw criteriaError;
      }

      // 4. One assignment per student, tied to this class
      const { error: assignmentError } = await learning
        .from("student_case_assignments")
        .insert(
          studentIds.map((studentId) => ({
            student_id: studentId,
            case_id: createdCase.id,
            classroom_id: access.classroom.id,
            encounter_status: "Scheduled",
            note_type: noteType,
            due_at: dueAt,
          })),
        );
      if (assignmentError) throw assignmentError;
    } catch (stepError) {
      await undoCase();
      throw stepError;
    }

    return response.status(201).json({
      caseId: createdCase.id,
      assigned: studentIds.length,
      message: `Assigned to ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("Unable to assign case:", error.message || error);
    return response.status(500).json({ message: "Unable to assign this case." });
  }
});

// ---- List the cases assigned in a classroom ----
instructorRouter.get("/classrooms/:classroomId/assignments", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const { supabaseAdmin: admin, profile } = context;

    const access = await verifyClassroomAccess(admin, profile, request.params.classroomId);
    if (!access) return response.status(404).json({ message: "Classroom not found." });

    const learning = admin.schema("learning");
    const { data: assignments, error } = await learning
      .from("student_case_assignments")
      .select("id, student_id, case_id, encounter_status, note_type, due_at, created_at")
      .eq("classroom_id", access.classroom.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!assignments?.length) return response.json({ assignments: [] });

    const caseIds = [...new Set(assignments.map((item) => item.case_id))];
    const studentIds = [...new Set(assignments.map((item) => item.student_id))];
    const assignmentIds = assignments.map((item) => item.id);

    const [casesResult, studentsResult, notesResult] = await Promise.all([
      learning.from("cases").select("id, title, patient_name").in("id", caseIds),
      admin.from("profiles").select("id, first_name, last_name").in("id", studentIds),
      learning
        .from("notes")
        .select("assignment_id, status, updated_at")
        .in("assignment_id", assignmentIds)
        .order("updated_at", { ascending: false }),
    ]);
    const queryError = casesResult.error || studentsResult.error || notesResult.error;
    if (queryError) throw queryError;

    const casesById = new Map((casesResult.data || []).map((item) => [item.id, item]));
    const namesById = new Map(
      (studentsResult.data || []).map((item) => [
        item.id,
        `${item.first_name || ""} ${item.last_name || ""}`.trim(),
      ]),
    );
    const noteStatusByAssignment = new Map();
    for (const note of notesResult.data || []) {
      if (!noteStatusByAssignment.has(note.assignment_id)) {
        noteStatusByAssignment.set(note.assignment_id, note.status); // newest first
      }
    }

    // One row per case, with its students underneath
    const byCase = new Map();
    for (const item of assignments) {
      const patientCase = casesById.get(item.case_id);
      const entry = byCase.get(item.case_id) || {
        caseId: item.case_id,
        title: patientCase?.title || "Untitled case",
        patientName: patientCase?.patient_name || "Unknown patient",
        noteType: item.note_type,
        dueAt: item.due_at,
        createdAt: item.created_at,
        students: [],
      };
      entry.students.push({
        assignmentId: item.id,
        name: namesById.get(item.student_id) || "Unknown student",
        encounterStatus: item.encounter_status,
        noteStatus: noteStatusByAssignment.get(item.id) || "Not started",
      });
      byCase.set(item.case_id, entry);
    }

    return response.json({ assignments: [...byCase.values()] });
  } catch (error) {
    console.error("Unable to load assigned cases:", error.message || error);
    return response.status(500).json({ message: "Unable to load assigned cases." });
  }
});

// GET /api/instructor/patients
// Retrieve existing patients with their demographic records.
instructorRouter.get("/patients", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;

    const admin = context.supabaseAdmin;

    const { data: patientRecords, error: recordsError } =
      await admin
        .from("patient_records")
        .select(
          "id, profile_id, date_of_birth, sex, phone, address, created_at"
        )
        .order("created_at", { ascending: false });

    if (recordsError) throw recordsError;

    if (!patientRecords?.length) {
      return response.json({ patients: [] });
    }

    const profileIds = [
      ...new Set(
        patientRecords
          .map((record) => record.profile_id)
          .filter(Boolean)
      ),
    ];

    const { data: profiles, error: profilesError } =
      profileIds.length
        ? await admin
            .from("profiles")
            .select(
              "id, first_name, last_name, careflow_id, roles(name)"
            )
            .in("id", profileIds)
        : { data: [], error: null };

    if (profilesError) throw profilesError;

    const profilesById = new Map(
      (profiles || [])
        .filter(
          (profile) =>
            relationName(profile.roles) === "Patient"
        )
        .map((profile) => [profile.id, profile])
    );

    const patients = patientRecords
      .filter((record) =>
        profilesById.has(record.profile_id)
      )
      .map((record) => {
        const profile = profilesById.get(record.profile_id);

        return {
          id: record.id,
          profileId: record.profile_id,
          name: [
            profile.first_name,
            profile.last_name,
          ]
            .filter(Boolean)
            .join(" "),
          careflowId: profile.careflow_id,
          dateOfBirth: record.date_of_birth,
          sex: record.sex,
          phone: record.phone,
          address: record.address,
          createdAt: record.created_at,
        };
      });

    return response.json({ patients });
  } catch (error) {
    console.error("Unable to load instructor patients:", error);

    return response.status(500).json({
      message: "Unable to load patients.",
    });
  }
});

instructorRouter.get("/patients/:patientId", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;

    const admin = context.supabaseAdmin;
    const patientRecordId = request.params.patientId;

    const { data: patientRecord, error: recordError } = await admin
      .from("patient_records")
      .select("*")
      .eq("id", patientRecordId)
      .maybeSingle();

    if (recordError) throw recordError;

    if (!patientRecord) {
      return response.status(404).json({
        message: "Patient not found.",
      });
    }

    const profileId = patientRecord.profile_id;

    if (!profileId) {
      return response.status(404).json({
        message: "Patient profile not found.",
      });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, first_name, last_name, careflow_id, roles(name)")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || relationName(profile.roles) !== "Patient") {
      return response.status(404).json({
        message: "Patient profile not found.",
      });
    }

    const portal = admin.schema("patient_portal");

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
        .eq("patient_id", profileId),

      portal
        .from("allergies")
        .select("*")
        .eq("profile_id", profileId),

      portal
        .from("medical_history")
        .select("*")
        .eq("profile_id", profileId),

      portal
        .from("appointments")
        .select("*")
        .eq("patient_id", profileId),

      portal
        .from("vitals")
        .select("*")
        .eq("patient_id", profileId),
    ]);

    const queryError =
      medicationsResult.error ||
      allergiesResult.error ||
      historyResult.error ||
      appointmentsResult.error ||
      vitalsResult.error;

    if (queryError) throw queryError;

    return response.json({
      patient: {
        id: patientRecord.id,
        profileId,
        name: [
          profile.first_name,
          profile.last_name,
        ].filter(Boolean).join(" "),
        careflowId: profile.careflow_id,
        dateOfBirth: patientRecord.date_of_birth,
        sex: patientRecord.sex,
        phone: patientRecord.phone,
        address: patientRecord.address,

        medications: medicationsResult.data || [],
        allergies: allergiesResult.data || [],
        medicalHistory: historyResult.data || [],
        appointments: appointmentsResult.data || [],
        vitals: vitalsResult.data || [],
      },
    });
  } catch (error) {
    console.error("Unable to load patient details:", error);

    return response.status(500).json({
      message: "Unable to load patient clinical records.",
    });
  }
});

// ---- Assignment drafts (instructor-only) ----
instructorRouter.get("/drafts", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const { data, error } = await context.supabaseAdmin
      .schema("learning")
      .from("assignment_drafts")
      .select("id, classroom_id, title, payload, updated_at")
      .eq("instructor_id", context.profile.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return response.json({ drafts: data || [] });
  } catch (error) {
    console.error("Unable to load drafts:", error.message || error);
    return response.status(500).json({ message: "Unable to load drafts." });
  }
});

instructorRouter.post("/drafts", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const { supabaseAdmin: admin, profile } = context;
    const { id, classroomId, title, payload } = request.body || {};

    if (!payload || typeof payload !== "object" || JSON.stringify(payload).length > 60000) {
      return response.status(400).json({ message: "Draft is empty or too large." });
    }
    // A draft may only point at a class this instructor teaches
    if (classroomId && !(await verifyClassroomAccess(admin, profile, classroomId))) {
      return response.status(404).json({ message: "Classroom not found." });
    }

    const row = {
      instructor_id: profile.id,
      classroom_id: classroomId || null,
      title: cleanText(title, 120) || null,
      payload,
      updated_at: new Date().toISOString(),
    };
    const table = admin.schema("learning").from("assignment_drafts");
    const query = id
      ? table.update(row).eq("id", id).eq("instructor_id", profile.id)
      : table.insert(row);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ message: "Draft not found." });
    return response.status(id ? 200 : 201).json({ id: data.id, message: "Draft saved." });
  } catch (error) {
    console.error("Unable to save draft:", error.message || error);
    return response.status(500).json({ message: "Unable to save the draft." });
  }
});

instructorRouter.delete("/drafts/:id", async (request, response) => {
  try {
    const context = await requireInstructor(request, response);
    if (!context) return;
    const { error } = await context.supabaseAdmin
      .schema("learning")
      .from("assignment_drafts")
      .delete()
      .eq("id", request.params.id)
      .eq("instructor_id", context.profile.id);
    if (error) throw error;
    return response.json({ message: "Draft deleted." });
  } catch (error) {
    console.error("Unable to delete draft:", error.message || error);
    return response.status(500).json({ message: "Unable to delete the draft." });
  }
});

export default instructorRouter;
