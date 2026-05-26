import { PlaceholderSurface } from "../_components/placeholder-surface";

export default function ProfilePage() {
  return (
    <PlaceholderSurface
      title="Hospital profile"
      description="The registered profile of this hospital — facility level, ownership, contact details, current Data-Processing Agreement version. Identity fields stay locked once approved; operational fields can be edited (audited)."
      upcoming={[
        "Profile view: facility level, ownership, region/district, capacity",
        "Current DPA version + signature evidence + renewal status",
        "Edit operational fields (phone, email, address) — audited",
        "Request profile change for locked fields (routed through superadmin)",
      ]}
    />
  );
}
