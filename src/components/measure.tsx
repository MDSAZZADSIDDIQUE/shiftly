/** A formatted measurement with its units set small and quiet: "8h 45m", "£1,236.24", "£14.25/h". */
export function Measure({ children }: { children: string }) {
  return (
    <>
      {children.split(/([a-z£%/]+)/i).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="unit">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}
