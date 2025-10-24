import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import {
  BookOpenTextIcon,
  BrainIcon,
  GaugeIcon,
  TabletSmartphoneIcon,
} from 'lucide-react'
import InsetHeader from '@/components/inset-header'

import TextRotate from '@/components/fancy/text/text-rotate'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import ContactForm from '@/components/contact-form'

export const Route = createFileRoute('/')({
  component: App,
})

const ServicesConfig = [
  {
    title: 'Web & Mobile Development',
    description:
      'Scalable applications built with React, React Native, Node.js, and modern TypeScript frameworks.',
    icon: TabletSmartphoneIcon,
  },
  {
    title: 'API Design & Systems Integration',
    description:
      'Secure, maintainable connections between platforms, services, and data sources.',
    icon: BrainIcon,
  },
  {
    title: 'Performance Optimization & Refactoring',
    description:
      'Streamline legacy systems, reduce technical debt, and improve long-term maintainability.',
    icon: GaugeIcon,
  },
  {
    title: 'Technical Consulting',
    description:
      'Architecture planning, codebase audits, and project leadership support.',
    icon: BookOpenTextIcon,
  },
]

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="" ref={containerRef}>
      <InsetHeader containerRef={containerRef} title="rafe.dev" />
      <div className="flex justify-center items-center">
        <div
          className="flex flex-col items-center max-w-2xl lg:max-w-4xl p-5 md:p-20 gap-20 sm:gap-30"
          style={{ paddingTop: 80 }}
        >
          <div className="flex flex-col justify-between items-center gap-8 text-center">
            <LayoutGroup>
              <motion.span
                className="flex whitespace-pre text-lg md:text-2xl"
                layout
              >
                <motion.span
                  className="pt-0.5 sm:pt-1 md:pt-2"
                  layout
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                >
                  {'Software built on '}
                </motion.span>
                <TextRotate
                  texts={['clarity.', 'reliability.', 'results.']}
                  mainClassName="text-white px-2 sm:px-2 md:px-3 bg-orange-500 overflow-hidden py-0.5 sm:py-1 md:py-2 justify-center rounded-lg"
                  staggerFrom={'last'}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '-120%' }}
                  staggerDuration={0.025}
                  splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1 md:pb-1"
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                  rotationInterval={3000}
                />
              </motion.span>
            </LayoutGroup>
            <p className="text-accent-foreground font-extralight">
              I partner with small to medium sized businesses to design, build,
              and refine software that performs — on time and to spec.
            </p>
          </div>
          <div className="flex flex-col w-full gap-6">
            <h1 className="text-2xl underline">Services</h1>
            {ServicesConfig.map((service) => (
              <Card key={service.title}>
                <CardHeader>
                  <div className="flex items-center gap-5">
                    <service.icon />
                    {service.title}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-extralight">
                    {service.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-col w-full gap-6">
            <h1 className="text-2xl underline">Approach</h1>
            <p className="text-accent-foreground font-extralight">
              My work is grounded in clear communication, predictable delivery,
              and technical precision. I adapt to existing teams, processes, and
              tools — providing senior-level execution without the overhead.
            </p>
          </div>
          <div className="flex flex-col w-full gap-6">
            <h1 className="text-2xl underline">Get in Touch</h1>
            <p className="text-accent-foreground font-extralight">
              If your team needs dependable engineering support or a trusted
              development partner, let’s talk about your next project.
            </p>
          </div>
          <ContactForm />
        </div>
      </div>
    </div>
  )
}
