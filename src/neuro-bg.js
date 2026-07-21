class NeuroBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: null, y: null, radius: 150 };
    this.color = 'rgba(254, 127, 45, '; // Orange color matching #FE7F2D
    
    this.init();
    this.animate();
    
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.initParticles();
    });
    
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.x;
      this.mouse.y = e.y;
    });
    
    window.addEventListener('mouseout', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
  }
  
  init() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.initParticles();
  }
  
  initParticles() {
    this.particles = [];
    const numberOfParticles = (this.canvas.width * this.canvas.height) / 9000;
    
    for (let i = 0; i < numberOfParticles; i++) {
      const size = (Math.random() * 2) + 1;
      const x = (Math.random() * ((this.canvas.width - size * 2) - (size * 2)) + size * 2);
      const y = (Math.random() * ((this.canvas.height - size * 2) - (size * 2)) + size * 2);
      const directionX = (Math.random() * 1) - 0.5;
      const directionY = (Math.random() * 1) - 0.5;
      
      this.particles.push(new Particle(this, x, y, directionX, directionY, size));
    }
  }
  
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update();
    }
    this.connect();
  }
  
  connect() {
    let opacityValue = 1;
    for (let a = 0; a < this.particles.length; a++) {
      for (let b = a; b < this.particles.length; b++) {
        const distance = ((this.particles[a].x - this.particles[b].x) * (this.particles[a].x - this.particles[b].x))
          + ((this.particles[a].y - this.particles[b].y) * (this.particles[a].y - this.particles[b].y));
        
        if (distance < (this.canvas.width / 7) * (this.canvas.height / 7)) {
          opacityValue = 1 - (distance / 20000);
          this.ctx.strokeStyle = this.color + opacityValue + ')';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(this.particles[a].x, this.particles[a].y);
          this.ctx.lineTo(this.particles[b].x, this.particles[b].y);
          this.ctx.stroke();
        }
      }
    }
  }
}

class Particle {
  constructor(neuroBg, x, y, directionX, directionY, size) {
    this.neuroBg = neuroBg;
    this.x = x;
    this.y = y;
    this.directionX = directionX;
    this.directionY = directionY;
    this.size = size;
  }
  
  draw() {
    this.neuroBg.ctx.beginPath();
    this.neuroBg.ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
    this.neuroBg.ctx.fillStyle = '#FE7F2D';
    this.neuroBg.ctx.fill();
  }
  
  update() {
    if (this.x > this.neuroBg.canvas.width || this.x < 0) {
      this.directionX = -this.directionX;
    }
    if (this.y > this.neuroBg.canvas.height || this.y < 0) {
      this.directionY = -this.directionY;
    }
    
    // Check collision with mouse
    let dx = this.neuroBg.mouse.x - this.x;
    let dy = this.neuroBg.mouse.y - this.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < this.neuroBg.mouse.radius + this.size) {
      if (this.neuroBg.mouse.x < this.x && this.x < this.neuroBg.canvas.width - this.size * 10) {
        this.x += 3;
      }
      if (this.neuroBg.mouse.x > this.x && this.x > this.size * 10) {
        this.x -= 3;
      }
      if (this.neuroBg.mouse.y < this.y && this.y < this.neuroBg.canvas.height - this.size * 10) {
        this.y += 3;
      }
      if (this.neuroBg.mouse.y > this.y && this.y > this.size * 10) {
        this.y -= 3;
      }
    }
    
    this.x += this.directionX;
    this.y += this.directionY;
    this.draw();
  }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new NeuroBackground('neuro-canvas');
});
