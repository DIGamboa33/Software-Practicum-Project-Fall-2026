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
// Used when the simulation starts (step 1) and by complete-step (later steps).
export async function openStep(learning, { step, caseId, classroomId, dueAt, noteType }) {
  const { data: assignment, error } = await learning
    .from("student_case_assignments")
    .insert({
      student_id: step.student_id,
      case_id: caseId,
      classroom_id: classroomId,
      encounter_status: "Scheduled",
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