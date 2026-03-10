import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function getImageUrl(imageKey: string) {
	return `https://images.rafe.dev/cdn-cgi/image/quality=50/${imageKey}`
}
