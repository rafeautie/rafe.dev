import { toast } from 'sonner'
import type { Layer } from '@webtoon/psd'
import type { LiveryShapeAttributeItem } from '@/types/livery'
import { SupportedShape } from '@/types/livery'
import { SHAPE_ATTRIBUTE_CONFIG } from '@/constants/livery'
import { getCarTemplate } from '@/functions/livery/getCarTemplate'
import { addLayer, addShape, selectLayer } from '@/state/livery-store'

export const getDefaultAttributesForShape = (type: SupportedShape) => {
  return [
    ...SHAPE_ATTRIBUTE_CONFIG.Base,
    ...SHAPE_ATTRIBUTE_CONFIG[type],
  ].reduce(
    (acc, attr) => {
      if (attr.default !== undefined) {
        acc[attr.key] = attr.default
      }
      return acc
    },
    {} as Record<string, any>,
  )
}

export const formatShapeAttribute = (
  type: LiveryShapeAttributeItem<any>['type'],
  value: string | boolean,
) => {
  switch (type) {
    case 'number':
      return Number(value)
    case 'boolean':
      return Number(value)
    default:
      return value
  }
}

export const getLayerData = async (layer: Layer) => {
  const pixels = await layer.composite()
  const width = layer.width
  const height = layer.height
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
  const bitmap = await createImageBitmap(imageData)
  return {
    x: layer.left,
    y: layer.top,
    width,
    height,
    name: layer.name,
    bitmap,
  }
}

export const downloadCarTemplate = async (
  carDisplayName: string,
  entryName: string,
) => {
  try {
    const beginDownload = async () => {
      const response = await getCarTemplate({ data: { entryName } })

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`)
      }

      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Dynamically import fflate for unzipping
      const { unzip } = await import('fflate')

      // Unzip the file
      const unzipped = await new Promise<Record<string, Uint8Array>>(
        (resolve, reject) => {
          unzip(uint8Array, (err, result) => {
            if (err) reject(err)
            else resolve(result)
          })
        },
      )

      // Find the first .psd file
      const psdFileName = Object.keys(unzipped).find((name) =>
        name.toLowerCase().endsWith('.psd'),
      )

      if (!psdFileName) {
        throw new Error('No PSD file found in the zip archive')
      }

      // Parse the PSD file
      const psdData = unzipped[psdFileName]
      const Psd = (await import('@webtoon/psd')).default

      // Create a proper ArrayBuffer for the PSD parser
      const psdArrayBuffer = new Uint8Array(psdData).buffer

      return Psd.parse(psdArrayBuffer)
    }

    const downloadPromise = beginDownload()

    toast.promise(downloadPromise, {
      loading: `Loading ${carDisplayName} template...`,
      success: `Loaded template for ${carDisplayName}.`,
      error: `Failed to load ${carDisplayName} template.`,
    })

    const psd = await downloadPromise

    const paintableLayersToDisplay =
      psd.children
        .at(-1)
        ?.children?.filter((layer) => layer.type === 'Layer')
        .reverse() ?? []

    const paintableResults = await Promise.all(
      paintableLayersToDisplay.map(getLayerData),
    )
    const paintableLayerId = addLayer({
      name: 'Paintable Area',
      layerType: 'paintable',
    })
    selectLayer(paintableLayerId)
    paintableResults.forEach((layerData) => {
      addShape({
        type: SupportedShape.Image,
        image: layerData.bitmap,
        ...layerData,
      })
    })

    const nonPaintableLayersToDisplay =
      psd.children
        .at(-2)
        ?.children?.filter((layer) => layer.type === 'Layer')
        .reverse() ?? []
    const nonPaintableResults = await Promise.all(
      nonPaintableLayersToDisplay.map(getLayerData),
    )
    const nonPaintableLayerId = addLayer({
      name: 'Template Non-Paintable Layer',
      layerType: 'non-editable-template-layers',
    })
    selectLayer(nonPaintableLayerId)
    nonPaintableResults.forEach((layerData) => {
      addShape({
        type: SupportedShape.Image,
        image: layerData.bitmap,
        draggable: false,
        listening: false,
        ...layerData,
      })
    })
    selectLayer(paintableLayerId)
  } catch (error) {
    console.error('Download error:', error)
    toast.error('Failed to load template.')
  }
}
