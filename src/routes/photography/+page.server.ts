import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({platform}) => {
	const objectData = await platform?.env.PHOTOS.list()

	if(!objectData) {
		return {
			images: []
		}
	}

	return {
		images: objectData.objects.map(({ key }) => ({ key }))
	};
};