/**
 * DELETE /api/account
 * Next.js App Router edge handler
 * Backs docs/compliance/ACCOUNT_DELETION.md
 */
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { handleDeleteAccountRequest } from '../../../api/account/delete';

export const runtime = 'edge';

export async function DELETE(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return handleDeleteAccountRequest(request, session.user.id);
}
