const suites = ["c", "h", "s", "d"];
const cardinality = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const label = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export const generateDeck = () => {
  const deck = suites.flatMap((suite) =>
    cardinality.map((value, index) => ({
      suite,
      value: label[index] + suite,
      label: label[index],
    }))
  );

  const shuffle1 = shuffle(deck);
  const shuffle2 = shuffle(deck);
  const shuffle3 = shuffle(deck);

  return shuffle3;
};

const shuffle = (array: Array<any>): Array<any> => {
  const newArray = array.slice(0);
  for (let i = newArray.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};
