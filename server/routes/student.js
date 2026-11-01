import { Router } from "express";
import { supabase, getSupabaseAdmin } from "../services/supabase.js";

const studentRouter = Router();

studentRouter.get("/cases", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return response.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select(`
      id,
      encounter_status,
      case:cases (
        id,
        title,
        patient_name,
        patient_age,
        patient_sex,
        chief_complaint,
        history,
        medications,
        allergies,
        results,
        starting_encounter_status
      )
    `)
    .eq("student_id", user.id)
    .order("id");

  if (error) {
    console.error("Unable to fetch cases:", error.message);

    return response.status(500).json({
      message: "Unable to load cases.",
    });
  }

  const cases = data.map((assignment) => ({
    ...assignment.case,
    assignment_id: assignment.id,
    encounter_status: assignment.encounter_status,
  }));

  return response.json(cases);
});

studentRouter.post("/notes", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return response.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  const { assignmentId, content } = request.body;

  if (!assignmentId || !content) {
    return response.status(400).json({
      message: "Assignment and note content are required.",
    });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Make sure this assignment belongs to the logged-in student.
  const { data: assignment, error: assignmentError } =
    await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({
      message: "You do not have access to this case.",
    });
  }

  // Check whether this assignment already has a SOAP note.
  const { data: existingNote, error: existingNoteError } =
    await supabaseAdmin
      .schema("learning")
      .from("notes")
      // status is selected so the lock check below can see it
      .select("id, status")
      .eq("assignment_id", assignmentId)
      .eq("note_type", "soap")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingNoteError) {
    console.error(
      "Unable to check existing note:",
      existingNoteError.message,
    );

    return response.status(500).json({
      message: "Unable to save note.",
    });
  }

  /*jazmin change*/
  // Locked while under review or approved; editable again only after the
  // instructor returns it. Prevents a save from resetting status to "Draft".
  if (
    existingNote &&
    ["Pending Review", "Approved"].includes(existingNote.status)
  ) {
    return response.status(409).json({
      message:
        "This note is locked. It can be edited again only if your instructor returns it.",
    });
  }
  /*jazmin change end*/

  let result;

  if (existingNote) {
    // Update the existing draft.
    result = await supabaseAdmin
      .schema("learning")
      .from("notes")
      .update({
        content,
        status: "Draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingNote.id)
      .select()
      .single();
  } else {
    // First save for this assignment.
    result = await supabaseAdmin
      .schema("learning")
      .from("notes")
      .insert({
        assignment_id: assignmentId,
        note_type: "soap",
        status: "Draft",
        content,
      })
      .select()
      .single();
  }

  if (result.error) {
    console.error(
      "Unable to save note:",
      result.error.message,
    );

    return response.status(500).json({
      message: "Unable to save note.",
    });
  }

  return response.json(result.data);
});

studentRouter.get("/notes/:assignmentId", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return response.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  const { assignmentId } = request.params;

  const supabaseAdmin = getSupabaseAdmin();

  const { data: assignment, error: assignmentError } =
    await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({
      message: "You do not have access to this case.",
    });
  }

  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("note_type", "soap")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load note:", error.message);

    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  // Attach the latest instructor feedback, if the note has been reviewed.
  let feedback = null;

  if (data) {
    const { data: review, error: reviewError } = await supabaseAdmin
      .schema("learning")
      .from("note_reviews")
      .select("decision, comments, created_at")
      .eq("note_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reviewError) {
      console.error("Unable to load feedback:", reviewError.message);
      return response.status(500).json({ message: "Unable to load note." });
    }

    feedback = review;
  }

  return response.json(data ? { ...data, feedback } : data);
});

studentRouter.patch(
  "/cases/:assignmentId/status",
  async (request, response) => {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    const accessToken = authorization.slice(7);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return response.status(401).json({
        message: "Invalid or expired session.",
      });
    }

    const { assignmentId } = request.params;
    const { encounterStatus } = request.body;

    const validStatuses = [
      "Scheduled",
      "Checked in",
      "Roomed",
      "In progress",
      "Checked out",
    ];

    if (!validStatuses.includes(encounterStatus)) {
      return response.status(400).json({
        message: "Invalid encounter status.",
      });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .update({
        encounter_status: encounterStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .select("id, case_id, encounter_status, updated_at")
      .maybeSingle();

    if (error) {
      console.error(
        "Unable to update encounter status:",
        error.message,
      );

      return response.status(500).json({
        message: "Unable to update encounter status.",
      });
    }

    if (!data) {
      return response.status(404).json({
        message: "Case assignment not found.",
      });
    }

    return response.json(data);
  },
);

studentRouter.post("/orders", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return response.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  const { assignmentId, orders } = request.body;

  if (!assignmentId || !Array.isArray(orders)) {
    return response.status(400).json({
      message: "Assignment and orders are required.",
    });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Make sure this assignment belongs to the logged-in student.
  const { data: assignment, error: assignmentError } =
    await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({
      message: "You do not have access to this case.",
    });
  }

    // Orders are locked together with the note once it is submitted.
  const { data: lockingNote, error: lockingNoteError } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .select("status")
    .eq("assignment_id", assignmentId)
    .eq("note_type", "soap")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lockingNoteError) {
    console.error("Unable to check note status:", lockingNoteError.message);
    return response.status(500).json({ message: "Unable to save orders." });
  }

  if (lockingNote && ["Pending Review", "Approved"].includes(lockingNote.status)) {
    return response.status(409).json({
      message: "Orders are locked while your note is submitted or approved.",
    });
  }

  const existingOrders = orders.filter(
    (order) => typeof order.id === "number" && order.id < 1000000000000,
  );

  const newOrders = orders.filter(
    (order) => typeof order.id !== "number" || order.id >= 1000000000000,
  );

  for (const order of existingOrders) {
  const { error: updateError } = await supabaseAdmin
    .schema("learning")
    .from("orders")
    .update({
      order_type: order.type,
      order_name: order.name,
      status: "Draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("assignment_id", assignmentId);

  if (updateError) {
    console.error(
      "Unable to update order:",
      updateError.message,
    );

    return response.status(500).json({
      message: "Unable to save orders.",
    });
  }
}

  const existingOrderIds = existingOrders.map(
    (order) => order.id,
  );

  let deleteQuery = supabaseAdmin
    .schema("learning")
    .from("orders")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("status", "Draft");

  if (existingOrderIds.length > 0) {
    deleteQuery = deleteQuery.not(
      "id",
      "in",
      `(${existingOrderIds.join(",")})`,
    );
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    console.error(
      "Unable to remove deleted orders:",
      deleteError.message,
    );

    return response.status(500).json({
      message: "Unable to save orders.",
    });
  }

  let newSavedOrders = [];

  if (newOrders.length > 0) {
    const newOrdersToSave = newOrders.map((order) => ({
      assignment_id: assignmentId,
      order_type: order.type,
      order_name: order.name,
      status: "Draft",
    }));

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("orders")
      .insert(newOrdersToSave)
      .select();

    if (error) {
      console.error(
        "Unable to save new orders:",
        error.message,
      );

      return response.status(500).json({
        message: "Unable to save orders.",
      });
    }

    newSavedOrders = data;
  }

  return response.status(200).json({
    message: "Orders saved successfully.",
  });
});

studentRouter.get(
  "/orders/:assignmentId",
  async (request, response) => {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    const accessToken = authorization.slice(7);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return response.status(401).json({
        message: "Invalid or expired session.",
      });
    }

    const { assignmentId } = request.params;

    const supabaseAdmin = getSupabaseAdmin();

    const { data: assignment, error: assignmentError } =
      await supabaseAdmin
        .schema("learning")
        .from("student_case_assignments")
        .select("id")
        .eq("id", assignmentId)
        .eq("student_id", user.id)
        .maybeSingle();

    if (assignmentError || !assignment) {
      return response.status(403).json({
        message: "You do not have access to this case.",
      });
    }

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("orders")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("id");

    if (error) {
      console.error(
        "Unable to load orders:",
        error.message,
      );

      return response.status(500).json({
        message: "Unable to load orders.",
      });
    }

    return response.json(data);
  },
);


studentRouter.post("/submissions", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authorization.slice(7));

  if (authError || !user) {
    return response.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  const { assignmentId } = request.body || {};

  if (!assignmentId) {
    return response.status(400).json({
      message: "Assignment is required.",
    });
  }

  const admin = getSupabaseAdmin();

  const { data: assignment, error: assignmentError } =
    await admin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError) {
    return response.status(500).json({
      message: "Unable to verify assignment.",
    });
  }

  if (!assignment) {
    return response.status(403).json({
      message: "You do not have access to this case.",
    });
  }

  const { data: note, error: noteError } = await admin
    .schema("learning")
    .from("notes")
    .select("id, status, content")
    .eq("assignment_id", assignmentId)
    .eq("note_type", "soap")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (noteError) {
    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  if (!note || !note.content) {
    return response.status(400).json({
      message: "Save a SOAP note before submitting.",
    });
  }

  if (!["Draft", "Returned"].includes(note.status)) {
    return response.status(409).json({
      message: "This note cannot be submitted.",
    });
  }

  const { data: submitted, error: submitError } =
    await admin
      .schema("learning")
      .from("notes")
      .update({
        status: "Pending Review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", note.id)
      .eq("assignment_id", assignmentId)
      .eq("status", note.status)
      .select()
      .maybeSingle();

  if (submitError) {
    console.error(submitError.message);
    return response.status(500).json({
      message: "Unable to submit documentation.",
    });
  }

  if (!submitted) {
    return response.status(409).json({
      message: "Submission status changed. Refresh and try again.",
    });
  }

  return response.json({
    message: "Submitted for instructor review.",
    note: submitted,
  });
});


studentRouter.get("/classes", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authorization.slice(7));

  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
    .schema("school")
    .from("classroom_enrollments")
    .select("classroom_id, status, enrolled_at")
    .eq("student_id", user.id);

  if (enrollmentsError) {
    console.error("Unable to load enrollments:", enrollmentsError.message);
    return response.status(500).json({ message: "Unable to load your classes." });
  }

  if (!enrollments.length) return response.json([]);

  const classroomIds = enrollments.map((row) => row.classroom_id);

  const [classroomsResult, membershipsResult] = await Promise.all([
    supabaseAdmin
      .schema("school")
      .from("classrooms")
      .select("id, crn, full_name, short_name, room, term, status, discipline_subrole_id")
      .in("id", classroomIds),
    supabaseAdmin
      .schema("school")
      .from("classroom_group_members")
      .select("group_id, classroom_id")
      .eq("student_id", user.id)
      .in("classroom_id", classroomIds),
  ]);

  if (classroomsResult.error || membershipsResult.error) {
    console.error(
      "Unable to load classes:",
      classroomsResult.error?.message || membershipsResult.error?.message,
    );
    return response.status(500).json({ message: "Unable to load your classes." });
  }

  const memberships = membershipsResult.data;
  let groups = [];

  if (memberships.length) {
    const { data, error } = await supabaseAdmin
      .schema("school")
      .from("classroom_groups")
      .select("id, name")
      .in("id", memberships.map((row) => row.group_id));

    if (error) {
      console.error("Unable to load groups:", error.message);
      return response.status(500).json({ message: "Unable to load your classes." });
    }
    groups = data;
  }

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const groupByClassroom = new Map(
    memberships.map((row) => [row.classroom_id, groupNameById.get(row.group_id) || null]),
  );
  const enrollmentByClassroom = new Map(
    enrollments.map((row) => [row.classroom_id, row]),
  );

  return response.json(
    classroomsResult.data.map((classroom) => ({
      ...classroom,
      enrollmentStatus: enrollmentByClassroom.get(classroom.id)?.status ?? null,
      group: groupByClassroom.get(classroom.id) || null,
    })),
  );
});

studentRouter.get("/classes/:classroomId", async (request, response) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authorization.slice(7));

  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const { classroomId } = request.params;
  const supabaseAdmin = getSupabaseAdmin();

  // Only enrolled students may see a class.
  const { data: enrollment, error: enrollmentError } = await supabaseAdmin
    .schema("school")
    .from("classroom_enrollments")
    .select("status, enrolled_at")
    .eq("classroom_id", classroomId)
    .eq("student_id", user.id)
    .maybeSingle();

  if (enrollmentError) {
    console.error("Unable to check enrollment:", enrollmentError.message);
    return response.status(500).json({ message: "Unable to load this class." });
  }

  if (!enrollment) {
    return response.status(403).json({ message: "You are not enrolled in this class." });
  }

  const [classroomResult, instructorLinksResult, membershipResult] =
    await Promise.all([
      supabaseAdmin
        .schema("school")
        .from("classrooms")
        .select("id, crn, full_name, short_name, room, term, status, discipline_subrole_id")
        .eq("id", classroomId)
        .single(),
      supabaseAdmin
        .schema("school")
        .from("classroom_instructors")
        .select("instructor_id")
        .eq("classroom_id", classroomId),
      supabaseAdmin
        .schema("school")
        .from("classroom_group_members")
        .select("group_id")
        .eq("classroom_id", classroomId)
        .eq("student_id", user.id),
    ]);

  const firstError =
    classroomResult.error || instructorLinksResult.error || membershipResult.error;
  if (firstError) {
    console.error("Unable to load class detail:", firstError.message);
    return response.status(500).json({ message: "Unable to load this class." });
  }

  // Discipline name (Pharmacy, Physical Therapy, ...) from public.subroles.
  const { data: subrole } = await supabaseAdmin
    .from("subroles")
    .select("name")
    .eq("id", classroomResult.data.discipline_subrole_id)
    .maybeSingle();

  let group = null;
  let mateIds = [];
  const groupId = membershipResult.data[0]?.group_id;

  if (groupId) {
    const [groupResult, matesResult] = await Promise.all([
      supabaseAdmin
        .schema("school")
        .from("classroom_groups")
        .select("id, name")
        .eq("id", groupId)
        .single(),
      supabaseAdmin
        .schema("school")
        .from("classroom_group_members")
        .select("student_id")
        .eq("group_id", groupId)
        .neq("student_id", user.id),
    ]);

    if (groupResult.error || matesResult.error) {
      console.error(
        "Unable to load group:",
        groupResult.error?.message || matesResult.error?.message,
      );
      return response.status(500).json({ message: "Unable to load this class." });
    }

    group = groupResult.data;
    mateIds = matesResult.data.map((row) => row.student_id);
  }

  const instructorIds = instructorLinksResult.data.map((row) => row.instructor_id);
  const profileIds = [...new Set([...instructorIds, ...mateIds])];
  let profileNames = new Map();

  if (profileIds.length) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", profileIds);

    if (profilesError) {
      console.error("Unable to load names:", profilesError.message);
      return response.status(500).json({ message: "Unable to load this class." });
    }

    profileNames = new Map(
      profiles.map((profile) => [
        profile.id,
        `${profile.first_name} ${profile.last_name}`.trim(),
      ]),
    );
  }

  return response.json({
    id: classroomResult.data.id,
    crn: classroomResult.data.crn,
    full_name: classroomResult.data.full_name,
    short_name: classroomResult.data.short_name,
    room: classroomResult.data.room,
    term: classroomResult.data.term,
    status: classroomResult.data.status,
    discipline: subrole?.name || null,
    enrollmentStatus: enrollment.status,
    enrolledAt: enrollment.enrolled_at,
    instructors: instructorIds.map((id) => profileNames.get(id)).filter(Boolean),
    group: group
      ? {
          name: group.name,
          teammates: mateIds.map((id) => profileNames.get(id)).filter(Boolean),
        }
      : null,
  });
});
export default studentRouter;