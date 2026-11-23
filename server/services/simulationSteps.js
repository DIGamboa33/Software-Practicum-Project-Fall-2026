// Providers who can take the specialist step (everything except Nursing, Front Desk, Biller)
export const PROVIDER_SUBROLE_IDS = [1, 3, 4, 5, 6, 7, 8, 9];

// for the sake of time, the only provider visit we will support will be from the pharmacy students
export const SIMULATION_STEPS = [
  { key: "front_desk_checkin", order: 1, label: "Front desk check-in", allowedSubroleIds: [10] },
  { key: "nurse_intake",       order: 2, label: "Nurse intake",        allowedSubroleIds: [2] },
  { key: "provider_visit",     order: 3, label: "Specialist visit",    allowedSubroleIds: PROVIDER_SUBROLE_IDS },
  { key: "billing",            order: 4, label: "Billing",             allowedSubroleIds: [11] },
];

// Creates the normal assignment for a step and marks the step open.
// Used when the simulation starts (step 1) and by complete-step (later steps)
export async function openStep(learning, { step, caseId, classroomId, dueAt, noteType, encounterStatus = "Scheduled" }) {
  const { data: assignment, error } = await learning
    .from("student_case_assignments")
    .insert({
      student_id: step.student_id,
      case_id: caseId,
      classroom_id: classroomId,
      encounter_status: encounterStatus,
      note_type: noteType,
      due_at: dueAt,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Only opens if still locked, so a double click can't open a step twice.
  const { data: claimed, error: claimError } = await learning
    .from("simulation_steps")
    .update({ status: "open", assignment_id: assignment.id })
    .eq("id", step.id)
    .eq("status", "locked")
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    await learning.from("student_case_assignments").delete().eq("id", assignment.id);
    if (claimError) throw claimError;
    return null; // someone else already opened it
  }
  return assignment.id;
}

// Which key of encounter.shared_data each step is allowed to write:
export const SHARED_KEY_BY_STEP = {
  front_desk_checkin: "front_desk",
  nurse_intake: "nurse",
  provider_visit: "provider",
  billing: "billing",
};

// Returns a list of problems. Empty list = this step may be completed.
// EVERYONE!! make sure the rules work for your assigned step/part
export async function stepRequirementProblems(learning, { step, assignmentId, sharedData }) {
  const problems = [];
  const mine = sharedData?.[SHARED_KEY_BY_STEP[step.step_key]] || {};

  if (step.step_key === "front_desk_checkin") {
    if (!String(mine.reason_for_visit || "").trim()) problems.push("Enter the reason for the visit.");
  }

  if (step.step_key === "nurse_intake") {
    if (!String(mine.chief_complaint || "").trim()) problems.push("Record the chief complaint.");
    const { count, error } = await learning
      .from("vitals")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", assignmentId);
    if (error) throw error;
    if (!count) problems.push("Save at least one set of vitals.");
  }

  if (step.step_key === "provider_visit") {
    const { count, error } = await learning
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", assignmentId)
      .in("status", ["Pending Review", "Approved", "Returned"]);
    if (error) throw error;
    if (!count) problems.push("Submit your note before finishing the visit.");
  }

  if (step.step_key === "billing") {
    if (!Array.isArray(mine.codes) || mine.codes.length === 0) problems.push("Add at least one billing code.");
  }

  return problems;
}