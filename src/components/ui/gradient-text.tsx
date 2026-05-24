"use client";

import React from "react";
import { motion, MotionProps } from "motion/react";

import { cn } from "../../lib/utils";

interface GradientTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> {
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}

function GradientText({
  className,
  children,
  as: Component = "span",
  ...props
}: GradientTextProps) {
  const MotionComponent = motion.create(Component);

  return (
    <MotionComponent
      className={cn(
        "animated-gradient-text inline-flex py-3",
        className,
      )}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}

export { GradientText };
