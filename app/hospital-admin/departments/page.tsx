import { PlaceholderSurface } from "../_components/placeholder-surface";

export default function DepartmentsPage() {
  return (
    <PlaceholderSurface
      title="Departments & wards"
      description="Active departments and HODs, ward roster, bed counts and live occupancy. The data backbone already exists from the hospital-registration upgrade — the surface lands in its own prompt."
      upcoming={[
        "Department directory with HOD assignment",
        "Ward roster with bed-count + current occupancy",
        "Create / archive a department (audited)",
        "Re-assign a HOD (audited)",
      ]}
    />
  );
}
