export default function HelpTip({ label }: { label: string }) {
  return (
    <abbr className="helpTip" title={label} aria-label={label}>
      ?
    </abbr>
  );
}
