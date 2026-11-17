import FounderControlRoomMobile from './index';

// Separate Expo Router route; shares the existing, read-only dashboard UI.
export default function ProtectedDashboard() {
  return <FounderControlRoomMobile protectedRoute />;
}
