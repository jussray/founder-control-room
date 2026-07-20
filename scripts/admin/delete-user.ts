/**
 * Operator-initiated account deletion — backs ACCOUNT_DELETION.md section 5
 * Usage: SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/admin/delete-user.ts <userId>
 */
import { deleteAccount } from '../../src/api/account/delete';

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: npx tsx scripts/admin/delete-user.ts <userId>');
  process.exit(1);
}

console.log(`Deleting user ${userId}...`);
deleteAccount(userId)
  .then((r) => { console.log('Account deleted:', r); process.exit(0); })
  .catch((e) => { console.error('Deletion failed:', e.message); process.exit(1); });
