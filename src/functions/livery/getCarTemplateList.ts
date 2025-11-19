import crypto from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { IRacingDataClient } from 'iracing-data-client'
import { CarIcon } from 'lucide-react'
import { listRemoteZip } from '../../lib/zip'
import type { Command } from '@/types/livery'
import { CAR_TEMPLATE_URL } from '@/constants/livery'
import { downloadCarTemplate } from '@/lib/livery'

export const getCarTemplateList = createServerFn().handler(async () => {
  return listRemoteZip(CAR_TEMPLATE_URL)
})

/** @ts-ignore - cant make sense of the typescript complaint */
export const getCarList = createServerFn().handler(async () => {
  const password = crypto
    .createHash('sha256')
    .update(process.env.IRACING_PASSWORD! + process.env.IRACING_EMAIL!)
    .digest('base64')

  const dataClient = new IRacingDataClient({
    email: process.env.IRACING_EMAIL,
    password: password,
  })

  return dataClient.car.get()
})

export const fetchFormattedCarTemplateList = async (): Promise<
  Array<Command>
> => {
  const [carList, carTemplateList] = await Promise.all([
    getCarList(),
    getCarTemplateList(),
  ])

  const carMap = Object.fromEntries(carList.map((item) => [item.carId, item]))

  return carTemplateList.map((templateName) => {
    const id = parseInt(templateName.split('_')[0], 10)
    const carName = carMap[id].carName
    return {
      name: carName || templateName,
      leftIcon: CarIcon,
      description: `Load ${carName} Template`,
      execute: () => downloadCarTemplate(carName, templateName),
    }
  })
}
