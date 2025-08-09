import matplotlib.pyplot as plt

def plot_drone_outcomes(battery_failure, success, damage_failure):
    labels = ['Battery Failure', 'Success', 'Damage Failure']
    sizes = [battery_failure, success, damage_failure]
    colors = ['#ff9999', '#66b3ff', '#99ff99']
    explode = (0.1, 0, 0)

    plt.figure(figsize=(6, 6))
    plt.pie(
        sizes,
        labels=labels,
        colors=colors,
        explode=explode,
        autopct='%1.1f%%',
        shadow=True,
        startangle=140
    )
    plt.title('Drone Flight Outcomes')
    plt.axis('equal')
    plt.show()

if __name__ == '__main__':
    battery_failure = 40
    success = 50
    damage_failure = 10
    plot_drone_outcomes(battery_failure, success, damage_failure)
