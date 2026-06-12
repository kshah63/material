// Canonical grade + school lists for the signup/invite dropdowns. Grades are a
// fixed set; SCHOOLS is seeded from the MathVision centre roster (extend as new
// schools appear). A free-text "Other" path in SchoolSelect covers anything not
// listed, so nobody is ever blocked from registering.

export const GRADES = [
  "K1",
  "K2",
  "Gr 1",
  "Gr 2",
  "Gr 3",
  "Gr 4",
  "Gr 5",
  "Gr 6",
  "Gr 7",
  "Gr 8",
  "Gr 9",
  "Gr 10",
  "Gr 11",
  "Gr 12",
  "Uni",
  "Alumni",
] as const;

export const SCHOOLS = [
  "AIS",
  "Anglo-Chinese School Barker",
  "Anglo-Chinese School Independent",
  "Anglo-Chinese School International",
  "Chatsworth",
  "CIS",
  "Dimensions",
  "Dover Court IS",
  "DPS",
  "Dulwich",
  "GESS",
  "GIIS",
  "Hwa Chong International",
  "ICS",
  "IFS",
  "Insworld School",
  "Invictus",
  "ISS",
  "Middleton",
  "Nexus",
  "NLCS",
  "NPS",
  "OFS",
  "OWIS",
  "SAIS",
  "SAS",
  "SOTA",
  "St Joseph's Institution",
  "St Joseph's Institution International",
  "Tanglin Trust School",
  "UWC Dover",
  "UWC East",
  "XCL",
  "YBIS",
  "University",
  "PVT",
] as const;

export const SCHOOL_SET: ReadonlySet<string> = new Set(SCHOOLS);
