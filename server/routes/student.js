import { Router } from "express";
import { supabase, getSupabaseAdmin } from "../services/supabase.js";
import { writeAuditLog } from "../services/auditLog.js";
import { SIMULATION_STEPS, SHARED_KEY_BY_STEP, openStep, stepRequirementProblems } from "../services/simulationSteps.js";

const studentRouter = Router();


studentRouter.get("/rxnorm/search", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { data: { user }, error } =
    await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: "Invalid session." });
  }

  const name = typeof req.query.name === "string"
    ? req.query.name.trim()
    : "";

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ message: "Invalid drug name." });
  }

  try {
    const url = new URL("https://rxnav.nlm.nih.gov/REST/drugs.json");
    url.searchParams.set("name", name);

    const result = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!result.ok) throw new Error("RxNorm unavailable");

    const data = await result.json();

    const medications = (data.drugGroup?.conceptGroup ?? [])
      .filter((group) => ["SCD", "SBD"].includes(group.tty))
      .flatMap((group) =>
        (group.conceptProperties ?? []).map((drug) => ({
          rxcui: drug.rxcui,
          name: drug.name,
          type: group.tty,
        }))
      )
      .filter((drug) => drug.rxcui && drug.name)
      .slice(0, 50);

    res.json(medications);
  } catch (err) {
    console.error(err);
    res.status(502).json({
      message: "RxNorm search unavailable.",
    });
  }
});


const NOTE_TYPES = {
  Pharmacy: [
    "pharmacy_soap",
    "pharmacy_sbar",
    "pharmacy_mtm",
    "pharmacy_phone",
    "pharmacy_telehealth",
  ],
};

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
  const { scope } = request.query;

  const DISCIPLINE_SCOPES = {
    pharmacy: "Pharmacy",
  };

  const discipline = DISCIPLINE_SCOPES[scope];

  if (!discipline || !NOTE_TYPES[discipline]) {
    return response.status(400).json({
      message: "Valid scope is required.",
    });
  }
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

  // Retrieve all notes for this assignment and discipline.
  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("discipline", discipline)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Unable to load note:", error.message);

    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  // Attach the latest instructor feedback to each note.
  const notes = data || [];

  if (notes.length === 0) {
    return response.json([]);
  }

  const noteIds = notes.map((note) => note.id);

  const { data: reviews, error: reviewError } = await supabaseAdmin
    .schema("learning")
    .from("note_reviews")
    .select("note_id, decision, comments, created_at")
    .in("note_id", noteIds)
    .order("created_at", { ascending: false });

  if (reviewError) {
    console.error(
      "Unable to load feedback:",
      reviewError.message,
    );

    return response.status(500).json({
      message: "Unable to load note feedback.",
    });
  }

  // Keep only the latest review for each note.
  const latestFeedback = new Map();

for (const review of reviews || []) {
  if (!latestFeedback.has(review.note_id)) {
    latestFeedback.set(review.note_id, {
      decision: review.decision,
      comments: review.comments,
      created_at: review.created_at,
    });
  }
}

// Attach feedback to each note.
const notesWithFeedback = notes.map((note) => ({
  ...note,
  feedback: latestFeedback.get(note.id) || null,
}));

return response.json(notesWithFeedback);
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

  const { assignmentId, discipline, noteType, title, content } =
    request.body || {};

  // Validate required fields.
  if (
    !assignmentId ||
    !discipline ||
    !noteType ||
    typeof title !== "string" ||
    !title.trim() ||
    !content ||
    typeof content !== "object" ||
    Array.isArray(content)
  ) {
    return response.status(400).json({
      message:
        "Assignment, discipline, note type, title, and note content are required.",
    });
  }

  // Make sure the note type belongs to the selected discipline.
  if (!Object.prototype.hasOwnProperty.call(NOTE_TYPES, discipline) ||
      !NOTE_TYPES[discipline].includes(noteType)) {
    return response.status(400).json({
      message: "Invalid discipline or note type.",
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

  if (assignmentError) {
    console.error(
      "Unable to verify assignment:",
      assignmentError.message,
    );

    return response.status(500).json({
      message: "Unable to verify case assignment.",
    });
  }

  if (!assignment) {
    return response.status(403).json({
      message: "You do not have access to this case.",
    });
  }

  // Create a new note without overwriting existing documents.
  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .insert({
      assignment_id: assignmentId,
      discipline,
      note_type: noteType,
      title: title.trim(),
      status: "Draft",
      content: {
        ...content,
        title: title.trim(),
      },
    })
    .select()
    .single();

  if (error) {
    console.error(
      "Unable to create note:",
      error.message,
    );

    return response.status(500).json({
      message: "Unable to create note.",
    });
  }
  
  
  // Derek: Record a successful new note creation.
  try {
    await writeAuditLog(supabaseAdmin, {
      actor_id: user.id,
      action: "note.created",
      entity_type: "clinical_note",
      entity_id: String(data.id),
      details: {
        assignment_id: assignmentId,
        noteType: noteType,
      },
    });
  } catch (error) {
    console.error("Unable to record note creation:", error);
  }

  
  return response.status(201).json(data);
});

studentRouter.patch("/notes/:noteId", async (request, response) => {
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

  const { noteId } = request.params;
  const { title, content } = request.body || {};

  // Validate note content.
  if (
    typeof title !== "string" ||
    !title.trim() ||
    !content ||
    typeof content !== "object" ||
    Array.isArray(content)
  ) {
    return response.status(400).json({
      message: "A valid title and note content are required.",
    });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Retrieve the existing note.
  const { data: existingNote, error: noteError } =
    await supabaseAdmin
      .schema("learning")
      .from("notes")
      .select("id, assignment_id, discipline, note_type, status")
      .eq("id", noteId)
      .maybeSingle();

  if (noteError) {
    console.error(
      "Unable to load note:",
      noteError.message,
    );

    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  if (!existingNote) {
    return response.status(404).json({
      message: "Note not found.",
    });
  }

  // Make sure this assignment belongs to the logged-in student.
  const { data: assignment, error: assignmentError } =
    await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", existingNote.assignment_id)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError) {
    console.error(
      "Unable to verify assignment:",
      assignmentError.message,
    );

    return response.status(500).json({
      message: "Unable to verify case assignment.",
    });
  }

  if (!assignment) {
    return response.status(403).json({
      message: "You do not have access to this note.",
    });
  }

  /*jazmin change*/
  // Locked while under review or approved; editable again only after the
  // instructor returns it. Prevents a save from resetting status to "Draft".
  if (
    ["Pending Review", "Approved"].includes(existingNote.status)
  ) {
    return response.status(409).json({
      message:
        "This note is locked. It can be edited again only if your instructor returns it.",
    });
  }
  /*jazmin change end*/

  // Only drafts and returned notes can be edited.
  if (!["Draft", "Returned"].includes(existingNote.status)) {
    return response.status(409).json({
      message: "This note cannot be edited in its current status.",
    });
  }

  // Update the existing note without creating a duplicate.
  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .update({
      title: title.trim(),
      content: {
        ...content,
        title: title.trim(),
      },
      status: "Draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("assignment_id", existingNote.assignment_id)
    .eq("status", existingNote.status)
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to update note:",
      error.message,
    );

    return response.status(500).json({
      message: "Unable to update note.",
    });
  }
  

  if (!data) {
    return response.status(409).json({
      message: "Note status changed. Refresh and try again.",
    });
  }
  
  
  // Derek: Record a successful note update.
  try {
    await writeAuditLog(supabaseAdmin, {
      actor_id: user.id,
      action: "note.updated",
      entity_type: "clinical_note",
      entity_id: String(data.id),
      details: {
        assignment_id: existingNote.assignment_id,
        noteType: existingNote.note_type,
      },
    });
  } catch (error) {
    console.error("Unable to record note update:", error);
  }


  return response.json(data);
});

// Submit an individual Pharmacy note for instructor review.
studentRouter.post("/notes/:noteId/submit", async (request, response) => {
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

  const { noteId } = request.params;
  const supabaseAdmin = getSupabaseAdmin();

  // Find the note.
  const { data: note, error: noteError } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .select("id, assignment_id, discipline, note_type, status")
    .eq("id", noteId)
    .maybeSingle();

  if (noteError) {
    console.error("Unable to load note:", noteError.message);

    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  if (!note) {
    return response.status(404).json({
      message: "Note not found.",
    });
  }

  // Only Pharmacy notes can use this endpoint.
  if (
    note.discipline !== "Pharmacy" ||
    !NOTE_TYPES.Pharmacy.includes(note.note_type)
  ) {
    return response.status(400).json({
      message: "This endpoint only supports Pharmacy notes.",
    });
  }

  // Verify that the logged-in student owns the assignment.
  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select("id")
    .eq("id", note.assignment_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (assignmentError) {
    console.error("Unable to verify assignment:", assignmentError.message);

    return response.status(500).json({
      message: "Unable to verify note ownership.",
    });
  }

  if (!assignment) {
    return response.status(403).json({
      message: "You do not have access to this note.",
    });
  }

  // Only drafts and returned notes may be submitted.
  if (!["Draft", "Returned"].includes(note.status)) {
    return response.status(409).json({
      message: "This note cannot be submitted in its current status.",
    });
  }

  // Submit the note.
  const { data: submitted, error: submitError } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .update({
      status: "Pending Review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id)
    .eq("assignment_id", note.assignment_id)
    .eq("status", note.status)
    .select()
    .maybeSingle();

  if (submitError) {
    console.error("Unable to submit note:", submitError.message);

    return response.status(500).json({
      message: "Unable to submit note.",
    });
  }

  if (!submitted) {
    return response.status(409).json({
      message: "Note status changed. Refresh and try again.",
    });
  }
  
  
  // Derek: Record a successful note submission.
  try {
    await writeAuditLog(supabaseAdmin, {
      actor_id: user.id,
      action: "note.submitted",
      entity_type: "clinical_note",
      entity_id: String(submitted.id),
      details: {
        assignment_id: note.assignment_id,
        previous_status: note.status,
        new_status: "Pending Review",
      },
    });
  } catch (error) {
    console.error("Unable to record note submission:", error);
  }


  return response.json({
    message: "Note submitted for instructor review.",
    note: submitted,
  });
});

// Delete a Pharmacy draft note.
studentRouter.delete("/notes/:noteId", async (request, response) => {
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

  const { noteId } = request.params;
  const supabaseAdmin = getSupabaseAdmin();

  // Retrieve the note.
  const { data: note, error: noteError } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .select("id, assignment_id, discipline, note_type, status")
    .eq("id", noteId)
    .maybeSingle();

  if (noteError) {
    console.error("Unable to load note:", noteError.message);

    return response.status(500).json({
      message: "Unable to load note.",
    });
  }

  if (!note) {
    return response.status(404).json({
      message: "Note not found.",
    });
  }

  // Only allow deletion of Pharmacy notes.
  if (
    note.discipline !== "Pharmacy" ||
    !NOTE_TYPES.Pharmacy.includes(note.note_type)
  ) {
    return response.status(403).json({
      message: "Only Pharmacy notes can be deleted here.",
    });
  }

  // Verify ownership of the case assignment.
  const { data: assignment, error: assignmentError } =
    await supabaseAdmin
      .schema("learning")
      .from("student_case_assignments")
      .select("id")
      .eq("id", note.assignment_id)
      .eq("student_id", user.id)
      .maybeSingle();

  if (assignmentError) {
    console.error(
      "Unable to verify note ownership:",
      assignmentError.message
    );

    return response.status(500).json({
      message: "Unable to verify note ownership.",
    });
  }

  if (!assignment) {
    return response.status(403).json({
      message: "You do not have access to this note.",
    });
  }

  // Only drafts can be deleted.
  if (note.status !== "Draft") {
    return response.status(409).json({
      message: "Only draft notes can be deleted.",
    });
  }

  // Delete only if the note is still a Draft.
  const { data: deleted, error: deleteError } = await supabaseAdmin
    .schema("learning")
    .from("notes")
    .delete()
    .eq("id", note.id)
    .eq("assignment_id", note.assignment_id)
    .eq("status", "Draft")
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("Unable to delete note:", deleteError.message);

    return response.status(500).json({
      message: "Unable to delete note.",
    });
  }

  if (!deleted) {
    return response.status(409).json({
      message: "Note status changed. Refresh and try again.",
    });
  }

  return response.json({
    message: "Draft deleted successfully.",
    deletedNoteId: deleted.id,
  });
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

  //Derek Change audit log for note submission
  try {
    await writeAuditLog( admin, {
      actor_id: user.id,
      action: "note.submitted",
      entity_type: "clinical_note",
      entity_id: String(submitted.id),
      details: {
        assignment_id: assignmentId,
        previous_status: note.status,
        new_status: "Pending Review",
      },
    });
    console.log("Audit log entry created for note submission.");
  } catch (error) {
    console.error("Error writing audit log:", error);
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

  // Surface only the cases assigned to this student in this classroom.  The
  // assignment is the source of truth here: a case can be reused in another
  // class without appearing in this student's current class workspace.
  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select(`
      id,
      case_id,
      encounter_status,
      note_type,
      due_at,
      created_at,
      updated_at,
      case:cases (
        id,
        title,
        patient_name,
        patient_age,
        patient_sex,
        chief_complaint
      )
    `)
    .eq("classroom_id", classroomId)
    .eq("student_id", user.id)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (assignmentsError) {
    console.error("Unable to load class assignments:", assignmentsError.message);
    return response.status(500).json({ message: "Unable to load this class." });
  }

  const assignmentIds = (assignments || []).map((assignment) => assignment.id);
  const caseIds = [...new Set((assignments || []).map((assignment) => assignment.case_id))];
  let latestNoteByAssignment = new Map();
  let latestReviewByNote = new Map();
  let scoreByReview = new Map();
  let possiblePointsByCase = new Map();

  if (assignmentIds.length) {
    const { data: notes, error: notesError } = await supabaseAdmin
      .schema("learning")
      .from("notes")
      .select("id, assignment_id, status, updated_at")
      .in("assignment_id", assignmentIds)
      .order("updated_at", { ascending: false });

    if (notesError) {
      console.error("Unable to load class notes:", notesError.message);
      return response.status(500).json({ message: "Unable to load this class." });
    }

    for (const note of notes || []) {
      if (!latestNoteByAssignment.has(note.assignment_id)) {
        latestNoteByAssignment.set(note.assignment_id, note);
      }
    }

    const latestNotes = [...latestNoteByAssignment.values()];
    if (latestNotes.length) {
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .schema("learning")
        .from("note_reviews")
        .select("id, note_id, decision, comments, created_at")
        .in("note_id", latestNotes.map((note) => note.id))
        .order("created_at", { ascending: false });

      if (reviewsError) {
        console.error("Unable to load class reviews:", reviewsError.message);
        return response.status(500).json({ message: "Unable to load this class." });
      }

      for (const review of reviews || []) {
        if (!latestReviewByNote.has(review.note_id)) {
          latestReviewByNote.set(review.note_id, review);
        }
      }

      const reviewIds = [...latestReviewByNote.values()].map((review) => review.id);
      if (reviewIds.length) {
        const { data: scores, error: scoresError } = await supabaseAdmin
          .schema("learning")
          .from("review_scores")
          .select("review_id, points_awarded")
          .in("review_id", reviewIds);

        if (scoresError) {
          console.error("Unable to load class scores:", scoresError.message);
          return response.status(500).json({ message: "Unable to load this class." });
        }

        for (const score of scores || []) {
          scoreByReview.set(
            score.review_id,
            (scoreByReview.get(score.review_id) || 0) + Number(score.points_awarded || 0),
          );
        }
      }
    }

    if (caseIds.length) {
      const { data: criteria, error: criteriaError } = await supabaseAdmin
        .schema("learning")
        .from("rubric_criteria")
        .select("case_id, max_points")
        .in("case_id", caseIds);

      if (criteriaError) {
        console.error("Unable to load class rubric criteria:", criteriaError.message);
        return response.status(500).json({ message: "Unable to load this class." });
      }

      for (const criterion of criteria || []) {
        possiblePointsByCase.set(
          criterion.case_id,
          (possiblePointsByCase.get(criterion.case_id) || 0) + Number(criterion.max_points || 0),
        );
      }
    }
  }

  const cases = (assignments || []).map((assignment) => {
    const note = latestNoteByAssignment.get(assignment.id);
    const review = note ? latestReviewByNote.get(note.id) : null;
    const possiblePoints = possiblePointsByCase.get(assignment.case_id) || 0;
    const earnedPoints = review ? scoreByReview.get(review.id) || 0 : null;

    return {
      assignmentId: assignment.id,
      caseId: assignment.case_id,
      title: assignment.case?.title || "Untitled case",
      patientName: assignment.case?.patient_name || "Unknown patient",
      patientAge: assignment.case?.patient_age || null,
      patientSex: assignment.case?.patient_sex || null,
      chiefComplaint: assignment.case?.chief_complaint || null,
      encounterStatus: assignment.encounter_status || "Not started",
      noteType: assignment.note_type || "soap",
      dueAt: assignment.due_at,
      assignedAt: assignment.created_at,
      updatedAt: assignment.updated_at,
      noteStatus: note?.status || "Not started",
      feedback: review
        ? {
            decision: review.decision,
            comments: review.comments,
            reviewedAt: review.created_at,
          }
        : null,
      grade: review && possiblePoints > 0
        ? { earnedPoints, possiblePoints }
        : null,
    };
  });

  // Announcements are optional until the classroom-announcements migration is
  // applied. Keeping the class endpoint usable before that rollout avoids
  // breaking the student dashboard during a staged deployment.
  const { data: announcements, error: announcementsError } = await supabaseAdmin
    .schema("school")
    .from("classroom_announcements")
    .select("id, title, body, is_pinned, created_at, updated_at")
    .eq("classroom_id", classroomId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);

  const announcementsTableIsMissing = ["42P01", "PGRST205"].includes(
    announcementsError?.code,
  );

  if (announcementsError && !announcementsTableIsMissing) {
    console.error("Unable to load classroom announcements:", announcementsError.message);
    return response.status(500).json({ message: "Unable to load this class." });
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
    cases,
    announcements: announcementsError ? [] : announcements || [],
  });
}

);

// GET vitals for a specific assignment
studentRouter.get("/assignments/:assignmentId/vitals", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  try {
   
    const { assignmentId } = request.params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("vitals")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("recorded_at", { ascending: false });

    if (error) throw error;
    return response.json(data);
  } catch (err) {
    console.error("Error fetching vitals endpoint:", err);
    return response.status(500).json({ message: err.message });
  }
});

// POST new vitals entry for an assignment
studentRouter.post("/assignments/:assignmentId/vitals", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }
  
  try {
    const { assignmentId } = request.params;
    const {
      systolic,
      diastolic,
      heart_rate,
      temperature,
      respiratory_rate,
      spo2,
      weight_lbs,
      blood_glucose_mg_dl,
      recorded_at,
    } = request.body;

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("vitals")
      .insert([
        {
          assignment_id: assignmentId,
          systolic: systolic ? parseInt(systolic, 10) : null,
          diastolic: diastolic ? parseInt(diastolic, 10) : null,
          heart_rate: heart_rate ? parseInt(heart_rate, 10) : null,
          temperature: temperature ? parseFloat(temperature) : null,
          respiratory_rate: respiratory_rate ? parseInt(respiratory_rate, 10) : null,
          spo2: spo2 ? parseInt(spo2, 10) : null,
          weight_lbs: weight_lbs ? parseFloat(weight_lbs) : null,
          blood_glucose_mg_dl: blood_glucose_mg_dl ? parseInt(blood_glucose_mg_dl, 10) : null,
          recorded_at: recorded_at || new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return response.status(201).json(data);
  } catch (err) {
    console.error("Error creating vitals endpoint:", err);
    return response.status(500).json({ message: err.message });
  }
});

// DELETE a vitals entry by ID
studentRouter.delete("/vitals/:vitalId", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const { vitalId } = request.params;
  const supabaseAdmin = getSupabaseAdmin();

  // Find the vital record and its assignment
  const { data: vital, error: vitalError } = await supabaseAdmin
    .schema("learning")
    .from("vitals")
    .select("id, assignment_id")
    .eq("id", vitalId)
    .maybeSingle();

  if (vitalError || !vital) {
    return response.status(404).json({ message: "Vitals record not found." });
  }

  // Verify that the logged-in student owns the case assignment
  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select("id")
    .eq("id", vital.assignment_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({ message: "You do not have permission to delete this record." });
  }

  const { error: deleteError } = await supabaseAdmin
    .schema("learning")
    .from("vitals")
    .delete()
    .eq("id", vitalId);

  if (deleteError) {
    console.error("Unable to delete vital:", deleteError.message);
    return response.status(500).json({ message: "Unable to delete vitals record." });
  }

  return response.json({ message: "Vitals record deleted successfully.", deletedId: vitalId });
});
// GET lab orders for a specific assignment
studentRouter.get("/assignments/:assignmentId/lab-orders", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  try {
    const { assignmentId } = request.params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("lab_orders")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("ordered_at", { ascending: false });

    if (error) throw error;
    return response.json(data || []);
  } catch (err) {
    console.error("Error fetching lab orders endpoint:", err);
    return response.status(500).json({ message: err.message });
  }
});

// POST new lab order entry for an assignment
studentRouter.post("/assignments/:assignmentId/lab-orders", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  try {
    const { assignmentId } = request.params;
    const {
      test_code,
      test_name,
      category,
      clinical_indication,
      fasting_required,
      specimen_type,
      priority,
      special_instructions,
    } = request.body;

    if (!test_name) {
      return response.status(400).json({ message: "Test name is required." });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("learning")
      .from("lab_orders")
      .insert([
        {
          assignment_id: assignmentId,
          test_code: test_code || null,
          test_name: test_name.trim(),
          category: category || "Chemistry",
          clinical_indication: clinical_indication || null,
          fasting_required: Boolean(fasting_required),
          specimen_type: specimen_type || null,
          priority: priority || "Routine",
          status: "Draft",
          special_instructions: special_instructions || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return response.status(201).json(data);
  } catch (err) {
    console.error("Error creating lab order endpoint:", err);
    return response.status(500).json({ message: err.message });
  }
});

// DELETE a lab order entry 
studentRouter.delete("/lab-orders/:orderId", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const { orderId } = request.params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .select("id, assignment_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return response.status(404).json({ message: "Lab order not found." });
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select("id")
    .eq("id", order.assignment_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({ message: "You do not have permission to delete this lab order." });
  }

  const { error: deleteError } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .delete()
    .eq("id", orderId);

  if (deleteError) {
    console.error("Unable to delete lab order:", deleteError.message);
    return response.status(500).json({ message: "Unable to delete lab order." });
  }

  return response.json({ message: "Lab order deleted successfully.", deletedId: orderId });
});

// UPDATE LAB but only if DRAFT
studentRouter.put("/lab-orders/:orderId", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const { orderId } = request.params;
  const {
    test_code,
    test_name,
    category,
    clinical_indication,
    fasting_required,
    specimen_type,
    priority,
    special_instructions,
  } = request.body;

  const supabaseAdmin = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .select("id, assignment_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError || !existing) {
    return response.status(404).json({ message: "Lab order not found." });
  }

  if (existing.status !== "Draft") {
    return response.status(400).json({ message: "Only draft lab orders can be modified." });
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select("id")
    .eq("id", existing.assignment_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({ message: "Permission denied." });
  }

  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .update({
      test_code: test_code || null,
      test_name: test_name?.trim() || existing.test_name,
      category: category || "Chemistry",
      clinical_indication: clinical_indication || null,
      fasting_required: Boolean(fasting_required),
      specimen_type: specimen_type || null,
      priority: priority || "Routine",
      special_instructions: special_instructions || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    return response.status(500).json({ message: error.message });
  }

  return response.json(data);
});

// PATCH lab order status, submitting the order
studentRouter.patch("/lab-orders/:orderId/status", async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return response.status(401).json({ message: "Authentication required." });
  }

  const accessToken = authorization.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return response.status(401).json({ message: "Invalid or expired session." });
  }

  const { orderId } = request.params;
  const { status } = request.body;

  if (!["Draft", "Submitted", "Ordered"].includes(status)) {
    return response.status(400).json({ message: "Invalid order status." });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .select("id, assignment_id")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError || !existing) {
    return response.status(404).json({ message: "Lab order not found." });
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .schema("learning")
    .from("student_case_assignments")
    .select("id")
    .eq("id", existing.assignment_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return response.status(403).json({ message: "Permission denied." });
  }

  const { data, error } = await supabaseAdmin
    .schema("learning")
    .from("lab_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    return response.status(500).json({ message: error.message });
  }

  return response.json(data);
});

// The student's rubric, points and feedback for one assignment.
studentRouter.get("/assignments/:assignmentId/grading", async (request, response) => {
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

  try {
    const learning = getSupabaseAdmin().schema("learning");

    // The assignment must belong to this student.
    const { data: assignment, error: assignmentError } = await learning
      .from("student_case_assignments")
      .select("id, case_id, due_at")
      .eq("id", request.params.assignmentId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (assignmentError) throw assignmentError;

    if (!assignment) {
      return response.status(403).json({
        message: "You do not have access to this case.",
      });
    }

    const [rubricResult, notesResult] = await Promise.all([
      learning
        .from("rubric_criteria")
        .select("id, description, max_points, position")
        .eq("case_id", assignment.case_id)
        .order("position"),
      learning.from("notes")
              .select("id, status, updated_at")
              .eq("assignment_id", assignment.id)
              .order("updated_at", { ascending: false }),
    ]);

    if (rubricResult.error) throw rubricResult.error;
    if (notesResult.error) throw notesResult.error;

    const noteIds = (notesResult.data || []).map((note) => note.id);

    // Latest instructor review across this assignment's notes.
        // Every instructor review for this assignment's notes, newest first.
    let review = null;
    let attempts = 0;

    if (noteIds.length > 0) {
      const { data, error } = await learning
        .from("note_reviews")
        .select("id, decision, comments, created_at")
        .in("note_id", noteIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      review = data?.[0] || null;
      attempts = data?.length || 0;
    }

    // Points and per-criterion feedback saved with that review.
    const scoresByCriterion = new Map();

    if (review) {
      const { data, error } = await learning
        .from("review_scores")
        .select("criterion_id, points_awarded, feedback")
        .eq("review_id", review.id);

      if (error) throw error;

      for (const row of data || []) {
        scoresByCriterion.set(row.criterion_id, row);
      }
    }

    // The full rubric, with points filled in where the instructor scored.
    const rubric = (rubricResult.data || []).map((criterion) => {
      const score = scoresByCriterion.get(criterion.id);

      return {
        id: criterion.id,
        description: criterion.description,
        maxPoints: Number(criterion.max_points),
        points: score ? Number(score.points_awarded) : null,
        feedback: score?.feedback || null,
      };
    });

    return response.json({
      review: review
        ? {
            decision: review.decision,
            comments: review.comments,
            created_at: review.created_at,
          }
        : null,
      rubric,
      dueAt: assignment.due_at,
      attempts,
      noteStatus: notesResult.data?.[0]?.status || null,
      totalPoints: rubric.reduce((sum, item) => sum + (item.points ?? 0), 0),
      totalMax: rubric.reduce((sum, item) => sum + item.maxPoints, 0),
      scoredCount: rubric.filter((item) => item.points !== null).length,
    });
  } catch (error) {
    console.error("Unable to load grading:", error.message || error);

    return response.status(500).json({ message: "Unable to load grading." });
  }
});

// ---- Simulation (shared encounter) ----
async function loadSimulationStep(request, response) {
  const token = (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    response.status(401).json({ message: "Missing access token." });
    return null;
  }
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    response.status(401).json({ message: "Your session has expired." });
    return null;
  }

  const admin = getSupabaseAdmin();
  const learning = admin.schema("learning");
  const { data: step, error } = await learning
    .from("simulation_steps")
    .select("id, encounter_id, step_key, step_order, student_id, status, assignment_id")
    .eq("assignment_id", request.params.assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!step) {
    response.status(404).json({ message: "This assignment is not part of a simulation." });
    return null;
  }
  if (step.student_id !== authData.user.id) {
    response.status(403).json({ message: "You do not have access to this case." });
    return null;
  }
  return { admin, learning, step };
}

// The whole encounter as this student should see it:
studentRouter.get("/assignments/:assignmentId/encounter", async (request, response) => {
  try {
    const ctx = await loadSimulationStep(request, response);
    if (!ctx) return;
    const { admin, learning, step } = ctx;

    const [encounterResult, stepsResult] = await Promise.all([
      learning
        .from("simulation_encounters")
        .select("id, case_id, status, shared_data, referral_subrole_id")
        .eq("id", step.encounter_id)
        .single(),
      learning
        .from("simulation_steps")
        .select("step_key, step_order, student_id, assignment_id, status, completed_at")
        .eq("encounter_id", step.encounter_id)
        .order("step_order"),
    ]);
    if (encounterResult.error) throw encounterResult.error;
    if (stepsResult.error) throw stepsResult.error;

    const studentIds = [...new Set(stepsResult.data.map((s) => s.student_id))];
    const { data: people, error: peopleError } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    if (peopleError) throw peopleError;
    const nameById = new Map(
      (people || []).map((p) => [p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim()]),
    );
    const labelByKey = new Map(SIMULATION_STEPS.map((d) => [d.key, d.label]));
    const encounter = encounterResult.data;

    return response.json({
      encounterId: encounter.id,
      caseId: encounter.case_id,
      status: encounter.status,
      sharedData: encounter.shared_data || {},
      referralSubroleId: encounter.referral_subrole_id,
      current: {
        stepKey: step.step_key,
        stepOrder: step.step_order,
        status: step.status,
        canEdit: step.status === "open" && encounter.status === "active",
      },
      steps: stepsResult.data.map((s) => ({
        order: s.step_order,
        key: s.step_key,
        label: labelByKey.get(s.step_key) || s.step_key,
        status: s.status,
        studentName: nameById.get(s.student_id) || "Unknown student",
        isMine: s.step_order === step.step_order,
      })),
      // Lets the vitals/notes/labs routes read everything in this encounter
      assignmentIds: stepsResult.data.map((s) => s.assignment_id).filter(Boolean),
    });
  } catch (error) {
    console.error("Unable to load simulation encounter:", error);
    return response.status(500).json({ message: "Unable to load this simulation." });
  }
});

// Save this step's data into its own key of shared_data:
studentRouter.patch("/assignments/:assignmentId/encounter-data", async (request, response) => {
  try {
    const ctx = await loadSimulationStep(request, response);
    if (!ctx) return;
    const { learning, step } = ctx;

    const data = request.body?.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || JSON.stringify(data).length > 20000) {
      return response.status(400).json({ message: "Send the fields to save as an object." });
    }
    if (step.status !== "open") {
      return response.status(409).json({ message: "This step is not open." });
    }

    const { data: encounter, error: encounterError } = await learning
      .from("simulation_encounters")
      .select("id, status, shared_data")
      .eq("id", step.encounter_id)
      .single();
    if (encounterError) throw encounterError;
    if (encounter.status !== "active") {
      return response.status(409).json({ message: "This simulation is already finished." });
    }

    const key = SHARED_KEY_BY_STEP[step.step_key];
    const current = encounter.shared_data || {};
    const merged = { ...current, [key]: { ...(current[key] || {}), ...data } };

    const { error: updateError } = await learning
      .from("simulation_encounters")
      .update({ shared_data: merged, updated_at: new Date().toISOString() })
      .eq("id", encounter.id);
    if (updateError) throw updateError;

    return response.json({ sharedData: merged, message: "Saved." });
  } catch (error) {
    console.error("Unable to save encounter data:", error);
    return response.status(500).json({ message: "Unable to save your changes." });
  }
});

// Finish this step and open the next one for the next student:
studentRouter.post("/assignments/:assignmentId/complete-step", async (request, response) => {
  try {
    const ctx = await loadSimulationStep(request, response);
    if (!ctx) return;
    const { learning, step } = ctx;

    if (step.status !== "open") {
      return response.status(409).json({ message: "This step is not open." });
    }

    const { data: encounter, error: encounterError } = await learning
      .from("simulation_encounters")
      .select("id, status, shared_data")
      .eq("id", step.encounter_id)
      .single();
    if (encounterError) throw encounterError;
    if (encounter.status !== "active") {
      return response.status(409).json({ message: "This simulation is already finished." });
    }

    const problems = await stepRequirementProblems(learning, {
      step,
      assignmentId: step.assignment_id,
      sharedData: encounter.shared_data || {},
    });
    if (problems.length) {
      return response.status(400).json({ message: problems[0], problems });
    }

    // Mark done only if still open:
    const { data: claimed, error: claimError } = await learning
      .from("simulation_steps")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", step.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return response.status(409).json({ message: "This step was already completed." });
    }

    const { data: nextStep, error: nextError } = await learning
      .from("simulation_steps")
      .select("id, student_id")
      .eq("encounter_id", step.encounter_id)
      .eq("step_order", step.step_order + 1)
      .maybeSingle();
    if (nextError) throw nextError;

    if (!nextStep) {
      await learning
        .from("simulation_encounters")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", step.encounter_id);
      return response.json({ message: "Simulation complete.", completed: true });
    }

    // The next student gets a normal assignment copied from this one:
    try {
      const { data: current, error: currentError } = await learning
        .from("student_case_assignments")
        .select("case_id, classroom_id, due_at, note_type")
        .eq("id", step.assignment_id)
        .single();
      if (currentError) throw currentError;

      await openStep(learning, {
        step: nextStep,
        caseId: current.case_id,
        classroomId: current.classroom_id,
        dueAt: current.due_at,
        noteType: current.note_type,
      });
    } catch (openError) {
      // Undo "done" so the student isn't stuck with nobody next in line:
      await learning
        .from("simulation_steps")
        .update({ status: "open", completed_at: null })
        .eq("id", step.id);
      throw openError;
    }

    return response.json({ message: "Step completed. The next role has been notified.", completed: false });
  } catch (error) {
    console.error("Unable to complete simulation step:", error);
    return response.status(500).json({ message: "Unable to complete this step." });
  }
});

export default studentRouter;
