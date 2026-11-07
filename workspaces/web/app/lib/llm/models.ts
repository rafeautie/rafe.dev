import { MODELS, type ChessModel } from '~/lib/chess/models';

// The models the simulation's people think with: Gemma 4, in the same two
// sizes /chess offers, with the same files, sizes and device checks
// (lib/chess/models.ts). Only the list is narrowed here.

export {
	downloadSize,
	dtypeFor,
	externalData,
	findCached,
	FIT_LABELS,
	fitFor,
	NO_GPU,
	readDevice,
	type DeviceInfo,
	type Dtype,
	type Fit
} from '~/lib/chess/models';

export type MindModel = ChessModel;

export const MIND_MODELS: MindModel[] = MODELS.filter((model) => model.family === 'Gemma 4');

export function findMindModel(id: string | undefined): MindModel | undefined {
	return MIND_MODELS.find((model) => model.id === id);
}
