'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { BRANCH_COOKIE, getBranches, requireBusiness } from '@/lib/business'

/** Remember which branch the manager is looking at ("" for all branches). */
export async function selectBranch(branchId: string) {
  const business = await requireBusiness()
  const branches = await getBranches(business.id)
  const store = await cookies()
  if (branches.some((b) => b.id === branchId)) {
    store.set(BRANCH_COOKIE, branchId, { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 * 365 })
  } else {
    store.delete(BRANCH_COOKIE)
  }
  revalidatePath('/', 'layout')
}
