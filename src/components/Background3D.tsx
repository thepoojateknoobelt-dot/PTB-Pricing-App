import React, { useEffect, useRef } from 'react';

export const Background3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Track mouse position for interactive rotation
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse positions to range [-1, 1]
      targetMouseX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      targetMouseY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    // Particle representation in 3D
    interface Particle {
      x: number;
      y: number;
      z: number;
      baseX: number;
      baseY: number;
      baseZ: number;
      angle: number;
      speed: number;
      phase: number;
    }

    const particleCount = 75;
    const particles: Particle[] = [];
    const maxDistance = 160;
    const focalLength = 380; // perspective focal length

    // Initialize particles in a 3D sphere/ellipsoid shape or grid
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = 240 + Math.random() * 120; // Radius

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      particles.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        angle: Math.random() * Math.PI * 2,
        speed: 0.0015 + Math.random() * 0.002,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let angleX = 0.001;
    let angleY = 0.001;

    // Helper for 3D rotation
    const rotateX = (x: number, y: number, z: number, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x,
        y: y * cos - z * sin,
        z: y * sin + z * cos,
      };
    };

    const rotateY = (x: number, y: number, z: number, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x: x * cos + z * sin,
        y,
        z: -x * sin + z * cos,
      };
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Interpolate mouse movements for smooth easing transitions
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      // Base rotation + mouse interaction rotation
      angleY += 0.0015;
      angleX += 0.0008;

      const currentAngleY = angleY + mouseX * 0.18;
      const currentAngleX = angleX + mouseY * 0.18;

      // 1. Project and Rotate Particles
      const projected = particles.map((p) => {
        // Add gentle noise/wave to base positions
        p.angle += p.speed;
        const wave = Math.sin(p.angle + p.phase) * 12;
        
        // Dynamic position
        const dx = p.baseX + (p.baseX / 200) * wave;
        const dy = p.baseY + (p.baseY / 200) * wave;
        const dz = p.baseZ + (p.baseZ / 200) * wave;

        // Rotate in 3D
        let rot = rotateY(dx, dy, dz, currentAngleY);
        rot = rotateX(rot.x, rot.y, rot.z, currentAngleX);

        // Perspective Projection
        const scale = focalLength / (focalLength + rot.z + 480); // 480 is camera offset/distance
        const projX = rot.x * scale + width / 2;
        const projY = rot.y * scale + height / 2;

        return {
          px: projX,
          py: projY,
          pz: rot.z,
          scale,
        };
      });

      // 2. Draw Connection Lines between close particles
      for (let i = 0; i < particleCount; i++) {
        const p1 = projected[i];
        if (p1.pz > focalLength) continue;

        for (let j = i + 1; j < particleCount; j++) {
          const p2 = projected[j];
          
          // Calculate distance in 3D
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dz = particles[i].z - particles[j].z;
          const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist3D < maxDistance) {
            const opacity = (1 - dist3D / maxDistance) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            
            // Draw linear gradient connection
            const grad = ctx.createLinearGradient(p1.px, p1.py, p2.px, p2.py);
            
            // Deeper elements have lower opacity
            const depthOpacity = Math.max(0, Math.min(1, (p1.pz + p2.pz + 800) / 1600));
            const finalOpacity = opacity * depthOpacity;

            grad.addColorStop(0, `rgba(99, 102, 241, ${finalOpacity})`); // indigo
            grad.addColorStop(1, `rgba(16, 185, 129, ${finalOpacity})`); // emerald

            ctx.strokeStyle = grad;
            ctx.lineWidth = Math.min(p1.scale, p2.scale) * 1.1;
            ctx.stroke();
          }
        }
      }

      // 3. Draw Dots/Nodes
      projected.forEach((p) => {
        const size = Math.max(1, p.scale * 3.2);
        const opacity = Math.max(0.1, Math.min(1, (p.pz + 480) / 960));

        ctx.beginPath();
        ctx.arc(p.px, p.py, size, 0, Math.PI * 2);
        
        // Draw glowing gradient particles
        const grad = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, size * 2.2);
        grad.addColorStop(0, `rgba(139, 92, 246, ${opacity * 0.9})`); // purple
        grad.addColorStop(0.5, `rgba(99, 102, 241, ${opacity * 0.6})`); // indigo
        grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.fillStyle = grad;
        ctx.fill();

        // Draw solid center core
        ctx.beginPath();
        ctx.arc(p.px, p.py, size * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.85})`;
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ mixBlendMode: 'normal' }}
    />
  );
};
