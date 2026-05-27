# Hoodz Customs - Premium Automotive Services Website

**AI-Powered Mechanic Concierge Platform**

Welcome to Hoodz Customs, your trusted source for professional automotive diagnostics, expert repairs, and seamless mechanic booking.

## Features

### 🤖 AI Mechanic Assistant
- **Smart Diagnostics**: Talk through your vehicle's symptoms and get instant AI analysis
- **Transparent Pricing**: See estimated cost ranges before committing
- **Service Windows**: Know how long repairs typically take
- **Expert Recommendations**: Get mechanic-ready notes for your appointment

### 🚗 Expert Services
- **Engine & Performance**: Diagnostics, tune-ups, and customization
- **Brake Systems**: Inspection, repair, and upgrades
- **Electrical & Battery**: Charging systems and electrical diagnostics
- **Tires & Suspension**: Alignment, balancing, and suspension work

### 📅 Easy Booking
- Run AI diagnosis
- Choose your preferred appointment slot
- Receive instant confirmation
- Get mechanic-ready summary

## Project Structure

```
Hoodz-Customs/
├── index.html          # Main webpage
├── styles.css          # Styling & responsive design
├── script.js           # AI diagnosis logic & interactivity
├── README.md           # This file
└── LICENSE             # Project license
```

## Getting Started

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/GXCell/Hoodz-Customs.git
   cd Hoodz-Customs
   ```

2. Open in your browser:
   ```bash
   # Simply open index.html in your web browser
   # Or use a local server:
   python -m http.server 8000
   # Then visit: http://localhost:8000
   ```

### Features to Explore
- **Hero Section**: Engaging garage-themed background with Dodge SRT visualization
- **Service Cards**: Browse available automotive services
- **AI Diagnosis Form**: Select symptoms and get instant analysis
- **Booking System**: Reserve your service appointment
- **Responsive Design**: Works on desktop, tablet, and mobile

## Technology Stack

- **HTML5**: Semantic structure
- **CSS3**: Modern styling with gradients and animations
- **JavaScript**: Interactive diagnosis engine and booking logic
- **SVG**: Custom garage graphics with Dodge SRT illustration

## Color Scheme

- **Primary Accent**: #ff6b35 (Orange - Energy, Performance)
- **Secondary Accent**: #4fd1c5 (Teal - Trust, Tech)
- **Background**: Dark theme (#0a0a0a) for professional appearance
- **Text**: Light palette for readability

## Diagnostic Database

The system covers four vehicle areas with multiple symptoms:

- **Engine**: Noise, Warning Lights, Hard Start, Vibration
- **Brakes**: Noise, Warning Lights, Hard Start, Vibration
- **Battery & Electrical**: Noise, Warning Lights, Hard Start, Vibration
- **Tires & Suspension**: Noise, Warning Lights, Hard Start, Vibration

Each combination provides:
- Likely diagnosis
- Estimated repair cost
- Service timeline
- Mechanic-ready notes

## Customization

### Update Diagnostics
Edit the `diagnosisMap` object in `script.js` to add or modify diagnoses.

### Modify Colors
Update CSS variables in `:root` section of `styles.css`:
```css
:root {
  --accent: #ff6b35;        /* Change primary color */
  --accent-secondary: #4fd1c5; /* Change secondary color */
  /* ... more variables */
}
```

### Change Garage Background
Edit the SVG in `index.html` or replace with your own car illustration.

## Responsive Breakpoints

- **Desktop**: 1120px max-width container
- **Tablet**: 900px breakpoint for grid adjustments
- **Mobile**: 600px breakpoint for mobile optimization

## Accessibility

- Semantic HTML structure
- ARIA live regions for dynamic content
- Focus management for form inputs
- Color contrast compliance
- Keyboard navigation support

## Future Enhancements

- [ ] Integration with local mechanic databases
- [ ] Real appointment scheduling with backend
- [ ] Customer review system
- [ ] Service history tracking
- [ ] Mobile app version
- [ ] Real-time chat with mechanics
- [ ] Video diagnostic support

## License

This project is licensed under the Mozilla Public License 2.0 - see LICENSE file for details.

## Support

For issues, feature requests, or questions, please open an issue on GitHub.

---

**Hoodz Customs** - Where Precision Meets Performance 🔧🏎️