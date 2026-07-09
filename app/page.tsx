'use client'

import dynamic from 'next/dynamic'
import { cn } from '@lib/utils'
import { Skeleton } from '@ui/skeleton'

const EDITOR_SKELETON_LINES = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3', 'w-3/5', 'w-1/2', 'w-2/5', 'w-4/6', 'w-1/2', 'w-3/5', 'w-2/5']

const StudioSkeleton = () => (
    <div className='flex h-dvh flex-col overflow-hidden bg-background text-foreground'>
        <header className='flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4'>
            <Skeleton className='h-4 w-32' />
            <div className='flex shrink-0 items-center gap-2'>
                <Skeleton className='h-8 w-36' />
                <Skeleton className='h-8 w-20' />
                <Skeleton className='h-8 w-20' />
                <Skeleton className='size-8' />
            </div>
        </header>

        <div className='flex min-h-0 flex-1 flex-col lg:flex-row'>
            <div className='flex min-h-0 flex-col border-border bg-card max-lg:h-[40%] max-lg:border-b lg:w-[32%] lg:border-r'>
                <div className='flex h-11 shrink-0 items-center justify-between border-b border-border px-3'>
                    <Skeleton className='h-3 w-20' />
                    <Skeleton className='h-5 w-16' />
                </div>
                <div className='flex min-h-0 flex-1 gap-3 px-3 py-2'>
                    <div className='flex w-6 flex-col gap-2 pt-0.5'>
                        {EDITOR_SKELETON_LINES.map((_, index) => (
                            <Skeleton key={index} className='h-3.5 w-full opacity-60' />
                        ))}
                    </div>
                    <div className='flex flex-1 flex-col gap-2 pt-0.5'>
                        {EDITOR_SKELETON_LINES.map((width, index) => (
                            <Skeleton key={index} className={cn('h-3.5 opacity-60', width)} />
                        ))}
                    </div>
                </div>
                <div className='h-8 shrink-0 border-t border-border' />
            </div>

            <div className='flex min-h-0 flex-1 flex-col'>
                <div className='flex h-11 shrink-0 items-center justify-between border-b border-border px-3'>
                    <Skeleton className='h-8 w-56' />
                    <Skeleton className='h-3 w-40' />
                </div>
                <div className='flex min-h-0 flex-1 flex-col gap-4 p-4'>
                    <Skeleton className='h-11 w-full rounded-lg' />
                    <Skeleton className='min-h-0 w-full flex-1 rounded-lg' />
                </div>
            </div>
        </div>
    </div>
)

const KeebStudio = dynamic(() => import('@widgets/keeb-studio').then((mod) => mod.KeebStudio), {
    ssr: false,
    loading: () => <StudioSkeleton />,
})

const Page = () => <KeebStudio />

export default Page
