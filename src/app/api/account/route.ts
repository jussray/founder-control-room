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
  // The user embedded in a cookie-backed session has not been verified.
  // Account deletion requires an identity fetched from the Auth server.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return handleDeleteAccountRequest(request, user.id);
}
