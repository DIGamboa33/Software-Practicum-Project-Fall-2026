export async function fetchRoles() {
  const response = await fetch("/api/roles");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load roles from the API.");
  }

  return payload;
}

export async function registerUser(registrationData) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registrationData),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || "Unable to create your account. Check that the API server is running.");
  }

  return payload;
}

export async function completePasswordSetup(passwordSetup) {
  const response = await fetch("/api/auth/complete-password-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(passwordSetup),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to set your password.");
  return payload;
}

export async function loginUser(credentials) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to sign in.");
  }

  return payload;
}

export async function fetchCurrentUser(accessToken) {
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to restore your session.");
  }

  return payload;
}

export async function fetchAdminUsers(query = "") {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const search = new URLSearchParams();
  if (query) search.set("query", query);

  const response = await fetch(`/api/admin/users?${search.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken || ""}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load the user directory.");
  }

  return payload;
}

function getAdminHeaders() {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  return {
    Authorization: `Bearer ${accessToken || ""}`,
    "Content-Type": "application/json",
  };
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: { ...getAdminHeaders(), ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to complete this admin action.");
  return payload;
}

export function fetchAdminAccessOptions() {
  return adminRequest("/access-options");
}

export function inviteAdminUser(account) {
  return adminRequest("/users/invite", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export function updateAdminUserAccess(userId, access) {
  return adminRequest(`/users/${userId}/access`, {
    method: "PATCH",
    body: JSON.stringify(access),
  });
}

export function requestAdminPasswordReset(userId) {
  return adminRequest(`/users/${userId}/password-reset`, { method: "POST" });
}

export function updateAdminUserStatus(userId, isActive) {
  return adminRequest(`/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function fetchAdminAuditLog() {
  return adminRequest("/audit-log");
}

export function fetchAdminAcademics() {
  return adminRequest("/academics");
}

export function createAdminClassroom(classroom) {
  return adminRequest("/academics/classrooms", {
    method: "POST",
    body: JSON.stringify(classroom),
  });
}

export function assignAdminClassroomInstructor(classroomId, instructorId) {
  return adminRequest(`/academics/classrooms/${classroomId}/instructors`, {
    method: "POST",
    body: JSON.stringify({ instructorId }),
  });
}

export function bulkInviteStudents(students) {
  return adminRequest("/students/bulk-invite", {
    method: "POST",
    body: JSON.stringify({ students }),
  });
}

async function instructorRequest(path, options = {}) {
  const response = await fetch(`/api/instructor${path}`, {
    ...options,
    headers: { ...getAdminHeaders(), ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to load instructor data.");
  return payload;
}

export function fetchInstructorDashboard() {
  return instructorRequest("/dashboard");
}

export function fetchInstructorClassrooms() {
  return instructorRequest("/classrooms");
}

export function fetchInstructorClassroom(classroomId) {
  return instructorRequest(`/classrooms/${classroomId}`);
}

export function fetchEligibleInstructorStudents() {
  return instructorRequest("/eligible-students");
}

export function createInstructorClassroomGroup(classroomId, group) {
  return instructorRequest(`/classrooms/${classroomId}/groups`, {
    method: "POST",
    body: JSON.stringify(group),
  });
}

export function addInstructorGroupMembers(classroomId, groupId, studentIds) {
  return instructorRequest(`/classrooms/${classroomId}/groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ studentIds }),
  });
}

export async function fetchAdminPatients() {
  //Get the login token from session storage
  const accessToken = sessionStorage.getItem("careflow-access-token");
  //Ask the Express API for the list of patients, 
  // passing the token in the Authorization header
  const response = await fetch("/api/admin/patients", {
    headers: { Authorization: `Bearer ${accessToken || ""}` },
  });
  const patients = await response.json();

  if (!response.ok) {
    throw new Error(patients.message || "Unable to load the patient directory.");
  }

  return patients;
}

export async function fetchAdminPatient(patientId) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch(`/api/admin/patients/${encodeURIComponent(patientId)}`, {
    headers: { Authorization: `Bearer ${accessToken || ""}` },
  });
  const patient = await response.json();

  if (!response.ok) {
    throw new Error(patient.message || "Unable to load the patient record.");
  }

  return patient;
}
export async function fetchStudentCases() {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch(
    "/api/student/cases",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to load cases.",
    );
  }

  return payload;
}

export async function saveStudentNote(note) {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch("/api/student/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(note),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to save note.",
    );
  }

  return payload;
}

export async function fetchStudentNote(assignmentId) {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch(
    `/api/student/notes/${assignmentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to load note.",
    );
  }

  return payload;
}

export async function updateStudentCaseStatus(
  assignmentId,
  encounterStatus,
) {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch(
    `/api/student/cases/${assignmentId}/status`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        encounterStatus,
      }),
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message ||
        "Unable to update encounter status.",
    );
  }

  return payload;
}

export async function saveStudentOrders(
  assignmentId,
  orders,
) {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch("/api/student/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assignmentId,
      orders,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to save orders.",
    );
  }

  return payload;
}

export async function fetchStudentOrders(assignmentId) {
  const accessToken = sessionStorage.getItem(
    "careflow-access-token",
  );

  if (!accessToken) {
    throw new Error(
      "No active session. Please sign in again.",
    );
  }

  const response = await fetch(
    `/api/student/orders/${assignmentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.message || "Unable to load orders.",
    );
  }

  return payload;

}

export async function fetchStudentClasses() {
  const accessToken = sessionStorage.getItem("careflow-access-token");

  if (!accessToken) {
    throw new Error("No active session. Please sign in again.");
  }

  const response = await fetch("/api/student/classes", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load your classes.");
  }

  return payload;
}

export async function fetchStudentClass(classroomId) {
  const accessToken = sessionStorage.getItem("careflow-access-token");

  if (!accessToken) {
    throw new Error("No active session. Please sign in again.");
  }

  const response = await fetch(
    `/api/student/classes/${encodeURIComponent(classroomId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load this class.");
  }

  return payload;
}

export function fetchAdminActivity() {
  return adminRequest("/activity");
}


export async function fetchPatientDashboard() {
  const accessToken = sessionStorage.getItem("careflow-access-token");

  if (!accessToken) {
    throw new Error("No active session. Please sign in again.");
  }

  const response = await fetch("/api/patient/dashboard", {
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  const payload = await response.json();
  
  

  if(!response.ok){
    throw new Error(payload.message || "Unable to load your patient health dashboard");

  }
  return payload;
  
}

export async function fetchPatientCareTeam() {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch("/api/patient/care-team", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load your care team.");
  }

  return payload;
}

export async function fetchPatientAppointments() {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch("/api/patient/appointments", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to load appointments.");
  return payload;
}

export async function schedulePatientAppointment(appointmentData) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch("/api/patient/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(appointmentData),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to schedule appointment.");
  return payload;
}

export async function updateReferralAppointment(referralId, appointmentId) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch(`/api/patient/referrals/${referralId}/schedule`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ appointmentId }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to update referral status.");
  return payload;
}

export async function fetchPatientVitals() {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch("/api/patient/vitals", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to load vitals.");
  return payload;
}

export async function fetchFrontDeskDashboard() {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch("/api/front-desk/dashboard", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load front desk dashboard.");
  }

  return payload;
}

export async function updateFrontDeskAppointmentStatus(appointmentId, status) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch(`/api/front-desk/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to update appointment status.");
  }

  return payload;
}

export async function createFrontDeskAppointment(appointmentData) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch("/api/front-desk/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(appointmentData),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to schedule appointment.");
  }

  return payload;
}

export async function confirmFrontDeskIntake(intakeData) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch("/api/front-desk/intakes/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(intakeData),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to confirm patient intake.");
  }

  return payload;
}

export async function fetchFrontDeskPatientReferrals(patientId) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch(`/api/front-desk/patients/${encodeURIComponent(patientId)}/referrals`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
 

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load patient referrals.");
  }

  return payload;
}

export async function updateFrontDeskReferralAppointment(referralId, appointmentId) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  const response = await fetch(`/api/front-desk/referrals/${referralId}/schedule`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ appointment_id: appointmentId }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to update referral status.");
  }

  return payload;
}

async function billingRequest(path, options = {}) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  const response = await fetch(`/api/billing${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken || ""}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Unable to complete billing action.");
  return payload;
}

export function fetchBillingDashboard() {
  return billingRequest("/dashboard");
}

export function updateClaimStatus(claimId, status) {
  return billingRequest(`/claims/${claimId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateClaimCodes(claimId, cpt_code, icd10_code) {
  return billingRequest(`/claims/${claimId}/codes`, {
    method: "PATCH",
    body: JSON.stringify({ cpt_code, icd10_code }),
  });
}