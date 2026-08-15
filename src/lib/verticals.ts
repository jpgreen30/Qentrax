/** Primary marketplace verticals — PX-aligned standard-field set. */
export const PRIMARY_VERTICALS = [
  {
    code: "life_insurance",
    name: "Life insurance",
    products: ["term", "whole"],
  },
  {
    code: "personal_loans",
    name: "Personal loans",
    products: ["unsecured"],
  },
  {
    code: "auto_insurance",
    name: "Auto insurance",
    products: ["standard", "non_standard"],
  },
  {
    code: "solar",
    name: "Solar",
    products: ["residential"],
  },
  {
    code: "home_services",
    name: "Home services",
    products: ["roofing", "hvac", "windows"],
  },
  {
    code: "legal",
    name: "Legal",
    products: ["personal_injury", "mass_tort"],
  },
  {
    code: "real_estate",
    name: "Real estate",
    products: ["buyer", "seller"],
  },
] as const;

export type PrimaryVerticalCode = (typeof PRIMARY_VERTICALS)[number]["code"];

export const PRIMARY_VERTICAL_CODES: PrimaryVerticalCode[] = PRIMARY_VERTICALS.map(
  (v) => v.code,
);
