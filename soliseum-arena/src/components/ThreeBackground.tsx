import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThreeBackgroundProps {
  color?: string;
}

export function ThreeBackground({ color = "primary" }: ThreeBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geometriesRef = useRef<THREE.Mesh[]>([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.002);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 50;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Get colors based on theme
    const getColor = (colorName: string) => {
      switch (colorName) {
        case "primary":
          return new THREE.Color(0x9945ff); // Purple
        case "secondary":
          return new THREE.Color(0x10ed85); // Teal
        default:
          return new THREE.Color(0x9945ff);
      }
    };

    let currentColor = getColor(color);

    // Create floating geometric shapes
    const geometries: THREE.Mesh[] = [];
    const shapes = [
      new THREE.IcosahedronGeometry(1.5, 0),
      new THREE.OctahedronGeometry(1.5, 0),
      new THREE.TetrahedronGeometry(1.5, 0),
    ];

    for (let i = 0; i < 15; i++) {
      const geometry = shapes[i % shapes.length];
      const material = new THREE.MeshPhongMaterial({
        color: currentColor,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
        emissive: currentColor,
        emissiveIntensity: 0.2,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      // Random rotation speeds
      mesh.userData.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.01,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.01,
      };

      scene.add(mesh);
      geometries.push(mesh);
    }
    geometriesRef.current = geometries;

    // Create particle system
    const particleCount = 1000;
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 200;
      positions[i + 1] = (Math.random() - 0.5) * 200;
      positions[i + 2] = (Math.random() - 0.5) * 200;
    }

    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const particlesMaterial = new THREE.PointsMaterial({
      color: currentColor,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
    particlesRef.current = particles;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(currentColor.getHex(), 1, 100);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(currentColor.getHex(), 0.5, 100);
    pointLight2.position.set(-10, -10, -10);
    scene.add(pointLight2);

    // Mouse movement handler
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Rotate geometries
      geometries.forEach((mesh) => {
        mesh.rotation.x += mesh.userData.rotationSpeed.x;
        mesh.rotation.y += mesh.userData.rotationSpeed.y;
        mesh.rotation.z += mesh.userData.rotationSpeed.z;
      });

      // Rotate particles slowly
      if (particles) {
        particles.rotation.y += 0.0005;
      }

      // Camera follows mouse with smooth lerp
      camera.position.x += (mouseRef.current.x * 5 - camera.position.x) * 0.05;
      camera.position.y += (mouseRef.current.y * 5 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };
    animate();

    // Update colors when prop changes
    const updateColors = () => {
      currentColor = getColor(color);
      
      geometries.forEach((mesh) => {
        const material = mesh.material as THREE.MeshPhongMaterial;
        material.color.set(currentColor);
        material.emissive.set(currentColor);
      });

      if (particles) {
        const material = particles.material as THREE.PointsMaterial;
        material.color.set(currentColor);
      }

      scene.traverse((object) => {
        if (object instanceof THREE.PointLight) {
          object.color.set(currentColor);
        }
      });
    };

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);

      geometries.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });

      if (particles) {
        particles.geometry.dispose();
        (particles.material as THREE.Material).dispose();
      }

      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update colors when color prop changes
  useEffect(() => {
    if (!sceneRef.current) return;

    const getColor = (colorName: string) => {
      switch (colorName) {
        case "primary":
          return new THREE.Color(0x9945ff);
        case "secondary":
          return new THREE.Color(0x10ed85);
        default:
          return new THREE.Color(0x9945ff);
      }
    };

    const newColor = getColor(color);

    // Update all materials
    geometriesRef.current.forEach((mesh) => {
      const material = mesh.material as THREE.MeshPhongMaterial;
      material.color.lerp(newColor, 0.1);
      material.emissive.lerp(newColor, 0.1);
    });

    if (particlesRef.current) {
      const material = particlesRef.current.material as THREE.PointsMaterial;
      material.color.lerp(newColor, 0.1);
    }

    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.PointLight) {
        object.color.lerp(newColor, 0.1);
      }
    });
  }, [color]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none opacity-40"
      style={{ zIndex: 0 }}
    />
  );
}
