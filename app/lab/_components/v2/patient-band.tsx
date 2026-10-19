import { LABWS2 } from "@/content/lab-workspace-v2";
import { Ident } from "./kit";

const B = LABWS2.bench.band;

/**
 * The patient on a navy band (prompt 5.5): name and hospital number together (Law 5), age and sex, lab number,
 * ward, received time. Text on navy is `on-band` (white) and `on-band-2`, both above 4.5:1.
 */
export function PatientBand({
  name,
  mrn,
  ageSex,
  labNo,
  ward,
  received,
  test,
}: {
  name: string;
  mrn: string;
  ageSex: string;
  labNo: string | null;
  ward: string | null;
  received: string | null;
  test: string;
}) {
  const facts: [string, string, boolean][] = [
    [B.hospitalNo, mrn, true],
    [B.ageSex, ageSex, false],
    ...(labNo ? ([[B.labNo, labNo, true]] as [string, string, boolean][]) : []),
    ...(ward ? ([[B.ward, ward, false]] as [string, string, boolean][]) : []),
    ...(received ? ([[B.received, received, false]] as [string, string, boolean][]) : []),
  ];
  return (
    <section
      aria-label={`${name}, ${mrn}`}
      className="bg-tide-navy-900 text-tide-on-band rounded-tide-card flex flex-wrap items-end gap-x-8 gap-y-3 px-5 py-4"
    >
      <div className="flex min-w-0 flex-col">
        <h2 className="text-[20px] leading-[26px] font-semibold">{name}</h2>
        <span className="text-tide-on-band-2 text-[13px]">{test}</span>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {facts.map(([k, v, id]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-tide-on-band-2 text-[11.5px] font-medium">{k}</dt>
            <dd className="text-[13.5px] font-medium">
              {id ? <Ident className="text-tide-on-band">{v}</Ident> : v}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
