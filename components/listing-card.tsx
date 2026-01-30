import { Skeleton } from "@/components/ui/skeleton"

export function ListingCard() {
    return (
        <div className="bg-white rounded-[32px] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-[320px] h-[380px] flex flex-col">
            {/* Image Area */}
            <div className="relative w-full h-[200px]">
                <Skeleton className="w-full h-full rounded-[24px]" />

                {/* Top Left Badge */}
                <div className="absolute top-4 left-4">
                    <Skeleton className="h-8 w-20 rounded-full bg-white/50 backdrop-blur-sm" />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-col mt-5 space-y-4 px-1">

                {/* Title */}
                <Skeleton className="h-6 w-1/3 rounded-full" />

                {/* Description Lines */}
                <div className="space-y-2.5">
                    <Skeleton className="h-4 w-full rounded-full" />
                    <Skeleton className="h-4 w-5/6 rounded-full" />
                    <Skeleton className="h-4 w-4/6 rounded-full" />
                </div>
            </div>
        </div>
    )
}
