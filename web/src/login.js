const stepCreds = document.getElementById("step-creds");
const stepOtp = document.getElementById("step-otp");
const actField = document.getElementById("activation-field");

function show(step) {
  [stepCreds, stepOtp].forEach((s) => s.classList.remove("active"));
  step.classList.add("active");
}

document.getElementById("continue").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  if (!email || !pass) return alert("Enter email and password");
  // TODO: check if this account needs activation code (first login after payment)
  const needsActivation = !localStorage.getItem("activated:" + email);
  actField.hidden = !needsActivation;
  show(stepOtp);
};

document.getElementById("finish").onclick = async () => {
  const otp = document.getElementById("otp").value.trim();
  const act = document.getElementById("activation").value.trim();
  if (!otp) return alert("Enter the email code");
  if (!actField.hidden && !act) return alert("Enter activation code");
  const email = document.getElementById("email").value.trim();
  // TODO: verify with Supabase, store session
  if (act) localStorage.setItem("activated:" + email, "1");
  localStorage.setItem("session", JSON.stringify({ email }));
  location.href = "/";
};
