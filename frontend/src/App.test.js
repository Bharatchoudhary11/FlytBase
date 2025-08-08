import { render, screen } from '@testing-library/react';
import App from './App';

test('renders analytics header', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          totalMissions: 1,
          averageBattery: 50,
          missionSuccessRate: 1,
        }),
    })
  );
  render(<App />);
  const header = await screen.findByText(/Org-wide Analytics/i);
  expect(header).toBeInTheDocument();
});
