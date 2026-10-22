import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react';
import { useEffect, useState } from 'react';
import { cn } from '~/lib/utils';

// Mirrors the Logo gradient in the shmoney app (src/renderer/src/components/logo.tsx).
// Keep the ShaderGradient props in sync with that file.
// fade eases the gradient in on mount; without it the gradient shows at once.
export default function LogoGradient({ fade = true }: { fade?: boolean }) {
	const [ready, setReady] = useState(!fade);
	useEffect(() => {
		const frame = requestAnimationFrame(() => setReady(true));
		return () => cancelAnimationFrame(frame);
	}, []);
	return (
		<div
			className={cn(
				'absolute inset-0',
				fade && 'transition-[opacity,filter] duration-[1200ms] ease-in-out',
				ready ? 'opacity-100 blur-none' : 'opacity-0 blur-sm'
			)}
		>
			{/* lazyLoad defaults to true, which unmounts the canvas offscreen and
			    replays the shader intro every time it scrolls back into view. */}
			<ShaderGradientCanvas
				lazyLoad={false}
				style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
			>
				<ShaderGradient
					animate="on"
					brightness={3}
					cAzimuthAngle={269}
					cDistance={1.5}
					cPolarAngle={146}
					cameraZoom={18.61}
					color1="#315f48"
					color2="#00d9ff"
					color3="#3700ff"
					envPreset="city"
					grain="off"
					lightType="3d"
					positionX={0}
					positionY={0}
					positionZ={0}
					range="disabled"
					rangeEnd={40}
					rangeStart={0}
					reflection={0.6}
					rotationX={0}
					rotationY={0}
					rotationZ={140}
					shader="defaults"
					type="sphere"
					uAmplitude={1}
					uDensity={5}
					uFrequency={5.5}
					uSpeed={0.03}
					uStrength={0.2}
					uTime={0}
					wireframe={false}
				/>
			</ShaderGradientCanvas>
		</div>
	);
}
