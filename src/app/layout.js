import './globals.css';
import './auth.css';
import './dashboard.css';
// Custom icons are now used instead of FontAwesome

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}