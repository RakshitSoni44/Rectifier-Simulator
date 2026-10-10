# Power Electronics Circuit Simulator

An interactive, high-fidelity web simulator for power electronics rectifiers and converters. Built with React, TypeScript, Tailwind CSS, Vite, and Recharts.

**Author:** Rakshit Soni  
**Roll Number:** 24EE10080  

---

## ⚡ Features

- **Multi-Topology Rectifiers**:
  - **1-Phase Diode Half-Wave & Full-Wave Bridge**
  - **1-Phase Thyristor (SCR) Controlled Half-Wave & Full-Wave Bridge**
  - **3-Phase Diode Half-Wave & 6-Pulse Full-Wave Bridge**
  - **3-Phase Thyristor (SCR) Controlled Half-Wave & 6-Pulse Full-Wave Bridge**
- **Animated Circuit Schematics**:
  - Dynamic vector SVG schematics showing active device conduction in real time.
  - Directional current flow animations indicating conduction loops.
  - Play, Pause, Scrubbing, and Speed controls ($0.1\times, 0.25\times, 0.5\times, 1.0\times$).
- **Dual-Trace Oscilloscope**:
  - Live voltage and current waveforms computed from time-domain numerical differential equations with RL load dynamics ($V_s$, $V_a$, $V_b$, $V_c$, $V_o$, $I_o$).
  - Dual Y-axes (Voltage in Volts on left, Current in Amperes on right).
  - Trace visibility toggle channels.
  - Interactive cursor tracking the instantaneous phase angle $\theta$.
- **Real-Time Analytical Readouts**:
  - Average Output Voltage ($V_{o,\text{avg}}$)
  - RMS Output Voltage ($V_{o,\text{rms}}$)
  - Average Load Current ($I_{o,\text{avg}}$)
  - Peak Current ($I_{o,\text{peak}}$)
  - Active conducting devices ($T_1, T_2, \dots$ / $D_1, D_2, \dots$)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation & Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/<repo-name>.git
   cd <repo-name>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000` (or the URL printed in the terminal).

4. **Build for production:**
   ```bash
   npm run build
   ```
   The production-ready static assets will be in the `dist` directory.

---

## 🌐 Deployment to GitHub Pages

This repository is pre-configured with a GitHub Actions workflow in `.github/workflows/deploy.yml` that automatically deploys the simulator to GitHub Pages whenever you push to `main`.

### To enable GitHub Pages:

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Power Electronics Simulator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

2. In your GitHub repository:
   - Go to **Settings** > **Pages**
   - Under **Build and deployment** > **Source**, choose **GitHub Actions**
   - Wait 1–2 minutes for the workflow to complete.
   - Your site will be live at: `https://<your-username>.github.io/<repo-name>/`

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Charts & Plotting**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 📝 License

This project is licensed under the Apache-2.0 License.
