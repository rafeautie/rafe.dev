import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const objectData = await platform?.env.PHOTOS.list()

	if (!objectData) {
		return {
			image: {
				key: ''
			}
		}
	}

	const randomIndex = Math.floor(Math.random() * (objectData.objects?.length || 1));
	const object = objectData.objects?.[randomIndex ?? 0]

	return {
		image: {
			key: object?.key,
		}
	};
};