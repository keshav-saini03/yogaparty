import { SignupForm } from '@/components/signup/SignupForm';
import { getDetectedCity } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const city = await getDetectedCity();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold mb-2 text-center">
        Join the Watch Party
      </h1>
      <p className="text-gray-600 text-center mb-8 max-w-sm">
        Three fields. No OTP. You&apos;re in.
      </p>
      <SignupForm detectedCity={city} />
    </main>
  );
}
