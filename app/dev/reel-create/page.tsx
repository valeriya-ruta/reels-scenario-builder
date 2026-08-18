import { notFound } from 'next/navigation';
import CreateReelScreen from '@/components/reels/CreateReelScreen';

/** Створення with no account, so its layout can be checked. Never in production. */
export default function ReelCreatePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CreateReelScreen />;
}
