import { ListingCard } from "@/components/listing-card";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <ListingCard />
        <ListingCard />
        <ListingCard />
      </div>
    </div>
  );
}
