import React from 'react';
import '../styles/Features.css';

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  { icon: '🍸', title: 'Select Bars', description: 'Browse popular spots or search by name.' },
  { icon: '🗺️', title: 'Optimize Route', description: 'We\'ll find the quickest walking loop.' },
  { icon: '📤', title: 'Share & Enjoy', description: 'Export your route or send a QR code to friends.' },
  { icon: '🛡️', title: 'Safety Tips', description: 'See well-lit paths and rest stops.' },
];

export const Features: React.FC = () => {
  return (
    <section className="features-section">
      <div className="features-container">
        {features.map((feature, index) => (
          <div key={index} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
