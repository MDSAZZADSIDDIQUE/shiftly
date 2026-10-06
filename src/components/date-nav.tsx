import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/date-field'

/** Prev / today / next links plus a date picker that also works without JavaScript. */
export function DateNav({ path, date, today }: { path: string; date: string; today: string }) {
  const step = (days: number) => {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  return (
    <form action={path} className="flex items-center gap-1">
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={`${path}?date=${step(-1)}`} aria-label="Previous day" />}>
        <ChevronLeftIcon />
      </Button>
      <DateField name="date" defaultValue={date} label="Date" />
      <Button variant="outline" size="icon" nativeButton={false} render={<Link href={`${path}?date=${step(1)}`} aria-label="Next day" />}>
        <ChevronRightIcon />
      </Button>
      {/* Picking a date submits on its own; this keeps Enter working without JavaScript. */}
      <button type="submit" className="sr-only">Go</button>
      {date !== today && (
        <Button variant="ghost" nativeButton={false} render={<Link href={path} />}>Today</Button>
      )}
    </form>
  )
}
