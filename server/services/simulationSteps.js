// The one simulation we support for now. Order matters.
export const SIMULATION_STEPS = [
  { key: "front_desk_checkin", order: 1, label: "Front desk check-in", subroleId: 10 },
  { key: "nurse_intake",       order: 2, label: "Nurse intake",        subroleId: 2 },
  { key: "provider_visit",     order: 3, label: "Specialist visit",    subroleId: null }, // pharmacy id not confirmed
  { key: "billing",            order: 4, label: "Billing",             subroleId: 11 },
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