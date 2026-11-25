import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStudentEncounter,
  saveStudentEncounterData,
  completeStudentStep,
} from "./api.js";

// for regular (non-simulation) cases this returns isSimulation: false and
// changes nothing, so existing pages keep working as intended
export function useEncounter(assignmentId) {
  const [encounter, setEncounter] = useState(null);
  const [loading, setLoading] = useState(Boolean(assignmentId));
  const [error, setError] = useState("");
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;

    if (!assignmentId) {
      setEncounter(null);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      setError("");
      const data = await fetchStudentEncounter(assignmentId);
      if (requestId === latestRequest.current) setEncounter(data);
      return data;
    } catch (loadError) {
      if (requestId === latestRequest.current) setError(loadError.message);
      return null;
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // save fields into this role's section
  const save = useCallback(
    async (data) => {
      const result = await saveStudentEncounterData(assignmentId, data);
      setEncounter((previous) =>
        previous ? { ...previous, sharedData: result.sharedData } : previous,
      );
      return result;
    },
    [assignmentId],
  );

  // Finishes the current step, throws with the requirement message if something is missing
  const complete = useCallback(async () => {
    const result = await completeStudentStep(assignmentId);
    await reload();
    return result;
  }, [assignmentId, reload]);

  const sharedData = encounter?.sharedData ?? {};
  const isSimulation = Boolean(encounter);

  // student-entered value if there is one, otherwise the case-file value (entered by intructor when creating the assignment)
  // fromCase is true when the fallback is used, so the UI can label it.
  const valueFor = useCallback(
    (section, field, caseValue) => {
      const entered = sharedData?.[section]?.[field];
      const hasValue =
        entered !== undefined &&
        entered !== null &&
        !(typeof entered === "string" && entered.trim() === "") &&
        !(Array.isArray(entered) && entered.length === 0);

      if (hasValue) return { value: entered, fromCase: false };

      return {
        value: caseValue ?? null,
        fromCase: isSimulation && caseValue != null && caseValue !== "",
      };
    },
    [sharedData, isSimulation],
  );

  return {
    isSimulation,
    loading,
    error,
    encounter,
    sharedData,
    steps: encounter?.steps ?? [],
    current: encounter?.current ?? null,
    canEdit: encounter?.current?.canEdit ?? false,
    valueFor,
    save,
    complete,
    reload,
  };
}