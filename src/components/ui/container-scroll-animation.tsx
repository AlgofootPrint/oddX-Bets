"use client";

import React, { useRef } from "react";
import { motion, MotionValue, useScroll, useTransform } from "framer-motion";

export const ContainerScroll = ({
  titleComponent,
  children,
  onComplete,
  mobileTransformScale = 1,
  mobileTransformX = 0,
  mobileTransformY = 0,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
  onComplete?: () => void;
  mobileTransformScale?: number;
  mobileTransformX?: number;
  mobileTransformY?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    let armed = true;

    const unsubscribe = scrollYProgress.on("change", (value) => {
      if (armed && value >= 0.98) {
        armed = false;
        onComplete?.();
        return;
      }

      if (value <= 0.9) {
        armed = true;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onComplete, scrollYProgress]);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  const scaleDimensions = () => {
    return isMobile ? [0.7, 0.9] : [1.12, 1];
  };

  const rotate = useTransform(scrollYProgress, [0, 1], isMobile ? [0, 0] : [34, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions());
  const translate = useTransform(scrollYProgress, [0, 1], [0, -100]);

  return (
    <div
      className="relative flex h-[36rem] items-start justify-center p-2 sm:h-[40rem] md:h-[64rem] md:items-center md:p-10"
      ref={containerRef}
    >
      <div
        className="relative w-full py-0 md:py-24"
        style={{
          perspective: "1000px",
        }}
      >
        <div
          className="relative"
          style={{
            transformStyle: "preserve-3d",
            transform: isMobile ? `translate(${mobileTransformX}px, 0px) scale(${mobileTransformScale})` : undefined,
            marginTop: isMobile ? `${mobileTransformY}px` : undefined,
            transformOrigin: isMobile ? "center top" : "center top",
          }}
        >
          <Header translate={translate} titleComponent={titleComponent} />
          <Card rotate={rotate} translate={translate} scale={scale}>
            {children}
          </Card>
        </div>
      </div>
    </div>
  );
};

export const Header = ({
  translate,
  titleComponent,
}: {
  translate: MotionValue<number>;
  titleComponent: string | React.ReactNode;
}) => {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="mx-auto max-w-5xl text-center"
    >
      {titleComponent}
    </motion.div>
  );
};

export const Card = ({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  translate: MotionValue<number>;
  children: React.ReactNode;
}) => {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
      }}
      className="mx-auto mt-0 h-[28rem] w-full max-w-7xl rounded-[24px] border-4 border-black/10 bg-white p-2 shadow-2xl sm:h-[32rem] md:-mt-20 md:h-[44rem] md:rounded-[30px] md:p-4 lg:-mt-14"
      >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-zinc-950">{children}</div>
    </motion.div>
  );
};
