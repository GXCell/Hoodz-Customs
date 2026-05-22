const diagnosisMap = {
  engine: {
    noise: {
      diagnosis: "Possible belt, pulley, or valve-train issue",
      price: "$180 - $520",
      timeline: "90-minute inspection",
      note: "Engine noise can come from loose accessory components or wear in moving parts. Limit hard driving until inspected.",
    },
    "warning-light": {
      diagnosis: "Sensor fault or emissions-related engine code",
      price: "$120 - $460",
      timeline: "Same-day diagnostic scan",
      note: "A warning light often needs a scan tool first. Bring details about when the light appears and any loss of power.",
    },
    "hard-start": {
      diagnosis: "Fuel delivery or ignition issue",
      price: "$160 - $640",
      timeline: "2-hour electrical check",
      note: "Starting trouble can involve the battery, starter, spark, or fuel pressure. The mechanic should test it before parts are replaced.",
    },
    vibration: {
      diagnosis: "Misfire or mount-related vibration",
      price: "$190 - $700",
      timeline: "Half-day repair window",
      note: "If vibration changes at idle versus highway speed, note that for the mechanic because it helps isolate the source.",
    },
  },
  brakes: {
    noise: {
      diagnosis: "Likely worn brake pads or rotor scoring",
      price: "$220 - $540",
      timeline: "2-3 hour service",
      note: "Grinding or squealing under braking usually points to pad wear or rotor damage. Safer to book as soon as possible.",
    },
    "warning-light": {
      diagnosis: "Brake fluid, ABS sensor, or wear warning issue",
      price: "$140 - $480",
      timeline: "Same-day brake inspection",
      note: "A brake light can indicate hydraulic or electronic braking faults. Avoid delaying if the pedal feels soft.",
    },
    "hard-start": {
      diagnosis: "Brake switch or interlock concern",
      price: "$110 - $260",
      timeline: "1-hour check",
      note: "If the vehicle will not shift or start while pressing the brake, the shop should inspect the brake switch and interlock.",
    },
    vibration: {
      diagnosis: "Warped rotors or uneven brake wear",
      price: "$260 - $620",
      timeline: "Half-day brake service",
      note: "Brake pedal pulsing or steering shake during stops often means rotor or caliper-related issues.",
    },
  },
  battery: {
    noise: {
      diagnosis: "Starter strain or charging-system noise",
      price: "$130 - $390",
      timeline: "1-hour charging test",
      note: "Clicking, whining, or slow cranking can indicate low voltage, alternator trouble, or starter wear.",
    },
    "warning-light": {
      diagnosis: "Battery or alternator warning circuit fault",
      price: "$90 - $410",
      timeline: "45-minute electrical test",
      note: "If the battery light comes on while driving, charging output should be tested before the battery is replaced.",
    },
    "hard-start": {
      diagnosis: "Weak battery, starter, or charging issue",
      price: "$140 - $420",
      timeline: "Priority mobile-ready test",
      note: "This is one of the most common signs of a failing battery or starter circuit. Bring any recent jump-start history.",
    },
    vibration: {
      diagnosis: "Loose battery mount or engine electrical fault",
      price: "$100 - $280",
      timeline: "1-hour inspection",
      note: "Battery-related vibration is less common, so the mechanic should inspect mounting security and related engine operation.",
    },
  },
  tires: {
    noise: {
      diagnosis: "Uneven tire wear or wheel-bearing style road noise",
      price: "$80 - $520",
      timeline: "Alignment and wheel check",
      note: "Road noise that grows with speed can come from aggressive tire wear, alignment problems, or bearing wear.",
    },
    "warning-light": {
      diagnosis: "Tire pressure or sensor issue",
      price: "$60 - $240",
      timeline: "30-minute tire scan",
      note: "Tire pressure alerts can be simple inflation corrections or a failing TPMS sensor depending on the reading.",
    },
    "hard-start": {
      diagnosis: "No direct tire-start link; inspect related safety systems",
      price: "$90 - $180",
      timeline: "General inspection",
      note: "Tires rarely cause starting problems, so this booking should include a broader inspection to avoid missing another issue.",
    },
    vibration: {
      diagnosis: "Balance, alignment, or tire damage issue",
      price: "$95 - $360",
      timeline: "1-2 hour tire service",
      note: "Vehicle shake at speed often comes from wheel balance, uneven wear, or a damaged tire carcass.",
    },
  },
};

const urgencyMessages = {
  today: "Because you need help today, the system prioritizes faster inspection windows and flags safety-sensitive symptoms.",
  week: "This looks appropriate for a standard service visit this week unless the symptoms worsen.",
  planning: "You can plan ahead, but keep monitoring the symptom so the diagnosis stays accurate.",
};

const appointmentOptions = {
  today: ["Today · 4:30 PM", "Tomorrow · 9:00 AM", "Tomorrow · 1:30 PM"],
  week: ["Tomorrow · 1:30 PM", "Friday · 11:00 AM", "Saturday · 10:00 AM"],
  planning: ["Friday · 11:00 AM", "Saturday · 10:00 AM", "Monday · 8:30 AM"],
};

const diagnosticForm = document.getElementById("diagnostic-form");
const bookingForm = document.getElementById("booking-form");
const appointmentSlot = document.getElementById("appointment-slot");
const bookingSubmit = document.getElementById("booking-submit");
const slotStatus = document.getElementById("slot-status");

let mechanicNotes = "";

diagnosticForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const system = document.getElementById("system").value;
  const symptom = document.getElementById("symptom").value;
  const urgency = document.getElementById("urgency").value;
  const details = document.getElementById("details").value.trim();

  const result = diagnosisMap[system][symptom];
  const urgencyNote = urgencyMessages[urgency];

  document.getElementById("diagnosis").textContent = result.diagnosis;
  document.getElementById("price-range").textContent = result.price;
  document.getElementById("timeline").textContent = result.timeline;
  document.getElementById("assistant-message").textContent =
    `Based on your ${system} ${symptom.replace(/-/g, " ")} report, I would start with: ${result.diagnosis}.`;

  mechanicNotes = `${result.note} ${urgencyNote}${details ? ` Driver notes: ${details}` : ""}`;
  document.getElementById("mechanic-note").textContent = mechanicNotes;

  appointmentSlot.innerHTML = "";
  appointmentOptions[urgency].forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot;
    option.textContent = slot;
    appointmentSlot.appendChild(option);
  });
  slotStatus.textContent = `Updated appointment choices for ${urgency} urgency. First available slot: ${appointmentOptions[urgency][0]}.`;

  document.getElementById("confirmation-text").textContent =
    "Diagnosis complete. Choose a slot below to send this summary to your mechanic.";
  bookingSubmit.disabled = false;
});

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.getElementById("customer-name").value.trim();
  const contact = document.getElementById("contact").value.trim();
  const slot = appointmentSlot.value;
  const diagnosis = document.getElementById("diagnosis").textContent;
  const price = document.getElementById("price-range").textContent;

  const readySummary = mechanicNotes || "General diagnostic appointment requested.";

  document.getElementById("confirmation-text").textContent =
    `${name}, your ${slot} appointment is reserved. The shop will contact you at ${contact} with a ${diagnosis.toLowerCase()} estimate of ${price}. Notes sent: ${readySummary}`;
});
