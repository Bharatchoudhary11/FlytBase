# FlyBase

## Overview
Drones are revolutionizing how companies inspect, monitor, and map their facilities, offering faster, safer, and more efficient alternatives to traditional methods. This platform enables large organizations to plan, manage, and monitor autonomous drone surveys across multiple global sites.

The system focuses on mission management, real-time monitoring, fleet coordination, and survey reporting. Data capture features such as live video or 3D map generation are outside the scope.

## Project Scope
This project handles mission management and reporting aspects of drone operations:

- **Mission Planning and Configuration**: Define survey areas, configure flight paths and altitudes, and set data collection parameters.
- **Fleet Visualisation and Management**: Display drone inventory, show real-time status, and track battery levels.
- **Real-time Mission Monitoring**: Visualize flight paths, track mission progress, and allow mission control actions like pause, resume, or abort.
- **Survey Reporting and Analytics**: Present survey summaries, individual flight statistics, and organization-wide analytics.

## Technical Considerations
- Scales to multiple concurrent missions across different locations.
- Supports advanced mission patterns such as crosshatch and perimeter.
- Allows mission-specific parameters like flight altitude and overlap percentage for comprehensive coverage.

## API Notes
### Mission Creation
`POST /missions` accepts the following fields:
- `orgId`, `name`, `area` (GeoJSON Polygon), `altitude`, `pattern`, `overlap`
- `dataFrequency` &ndash; data collection frequency in hertz
- `sensors` &ndash; optional array of sensor identifiers to activate during the mission

At FlytBase, we prioritize high-quality, reliable features over superficial coverage. Focus on thoughtful design and engineering to deliver well-crafted solutions.
