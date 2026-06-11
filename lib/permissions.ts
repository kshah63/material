import type { CourseCapabilities, CourseRole } from "./types";

export function capabilitiesFor(
  role: CourseRole | null,
  isAdmin: boolean,
): CourseCapabilities {
  return {
    role,
    isAdmin,
    canManage: isAdmin || role === "in_charge",
    canSeeTeacherOnly: isAdmin || role === "in_charge" || role === "teacher",
  };
}
