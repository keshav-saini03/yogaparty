type Props = {
  city: string | null;
  cityCount: number;
  totalCount: number;
};

export function SocialProof({ city, cityCount, totalCount }: Props) {
  const fmt = new Intl.NumberFormat('en-IN');
  let line: string;
  if (city && cityCount > 0) {
    line = `${fmt.format(cityCount)} people from ${city} watching`;
  } else if (city && cityCount === 0) {
    line = `Be the first from ${city}`;
  } else {
    line = `${fmt.format(totalCount)} people watching`;
  }

  return (
    <p className="text-center text-sm text-gray-500 px-6">
      <span className="inline-block h-2 w-2 rounded-full bg-green-500 align-middle mr-2" />
      {line}
    </p>
  );
}
