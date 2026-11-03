// Payment / signup flow. Selar URL is a placeholder.
const SELAR_URL = "https://selar.co/findmysize-activate"; // placeholder

const stepSignup = document.getElementById("step-signup");
const stepOtp = document.getElementById("step-otp");
const stepActivate = document.getElementById("step-activate");

function show(step) {
  [stepSignup, stepOtp, stepActivate].forEach((s) => s.classList.remove("active"));
  step.classList.add("active");
}

document.getElementById("send-otp").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  const conf = document.getElementById("confirm").value;
  if (!email || pass.length < 6 || pass !== conf) {
    alert("Check email and matching passwords (6+ chars)");
    return;
  }
  // TODO: call Supabase signup + OTP
  sessionStorage.setItem("pendingEmail", email);
  show(stepOtp);
};

document.getElementById("verify-otp").onclick = async () => {
  const otp = document.getElementById("otp").value.trim();
  if (otp.length < 4) return alert("Enter the code");
  // TODO: verify OTP with Supabase
  show(stepActivate);
};

document.getElementById("go-pay").onclick = () => {
  // After Selar, user lands on a one-time page with the code
  window.location.href = SELAR_URL + "?redirect=" + encodeURIComponent(location.origin + "/pay/done");
};
